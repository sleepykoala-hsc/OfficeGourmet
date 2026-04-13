// pages/index/index.js
const util = require('../../utils/util')
const { restaurants: localRestaurants } = require('../../data/restaurants')

const SPIN_DURATION = 1500 // 动画时长 ms
const SPIN_INTERVAL = 150  // 每帧间隔 ms

const ALL_EMOJIS = ['🍜', '🍛', '🥗', '🍱', '🍣', '🍔', '🥩', '🍲', '🥟', '🍝']
const CATEGORIES = ['全部', '中式', '日式', '韩式', '西式', '粤式', '台式', '素食', '东南亚']

Page({
  data: {
    mealType: 'lunch',
    mealTimeLabel: '午餐',
    currentRestaurant: null,
    isSpinning: false,
    spinningEmoji: '🎲',
    isFavorite: false,
    ratingStars: '',
    categories: CATEGORIES,
    activeCategory: '全部'
  },

  onLoad() {
    // 根据当前时间自动设置用餐类型
    const mealType = util.getMealTime()
    const validType = mealType === 'other' ? 'lunch' : mealType
    this.setData({
      mealType: validType,
      mealTimeLabel: validType === 'lunch' ? '午餐' : '晚餐'
    })
  },

  onShow() {
    // 每次显示页面都刷新收藏状态
    if (this.data.currentRestaurant) {
      const favorites = wx.getStorageSync('favorites') || []
      this.setData({
        isFavorite: favorites.includes(this.data.currentRestaurant.id)
      })
    }
  },

  // 切换用餐类型
  setMealType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      mealType: type,
      mealTimeLabel: type === 'lunch' ? '午餐' : '晚餐',
      currentRestaurant: null,
      activeCategory: '全部'
    })
  },

  // 设置品类筛选
  setCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({ activeCategory: category })
    // 如果已有推荐，直接重新推荐
    if (this.data.currentRestaurant || this.data.activeCategory !== category) {
      this.rollRandom()
    }
  },

  // 随机推荐
  rollRandom() {
    if (this.data.isSpinning) return
    this.setData({ isSpinning: true, currentRestaurant: null })

    // 动画帧
    let frameCount = 0
    const totalFrames = Math.floor(SPIN_DURATION / SPIN_INTERVAL)
    const timer = setInterval(() => {
      frameCount++
      const emoji = ALL_EMOJIS[frameCount % ALL_EMOJIS.length]
      this.setData({ spinningEmoji: emoji })
      if (frameCount >= totalFrames) {
        clearInterval(timer)
        this._doRecommend()
      }
    }, SPIN_INTERVAL)
  },

  _doRecommend() {
    const app = getApp()
    const blacklist = wx.getStorageSync('blacklist') || []
    const favorites = wx.getStorageSync('favorites') || []
    const history = wx.getStorageSync('history') || {}
    const preferences = wx.getStorageSync('preferences') || {}

    let restaurants = wx.getStorageSync('restaurants') || localRestaurants

    // 按品类过滤
    if (this.data.activeCategory && this.data.activeCategory !== '全部') {
      const filtered = restaurants.filter(r => r.category === this.data.activeCategory)
      if (filtered.length > 0) restaurants = filtered
    }

    const result = util.recommend(
      restaurants,
      this.data.mealType,
      blacklist,
      favorites,
      history,
      preferences
    )

    if (!result) {
      this.setData({ isSpinning: false })
      wx.showToast({ title: '没有找到合适的餐厅', icon: 'none' })
      return
    }

    const isFavorite = favorites.includes(result.id)
    const fullStars = Math.floor(result.rating)
    const halfStar = result.rating % 1 >= 0.5 ? '½' : ''
    const emptyStars = '☆'.repeat(5 - fullStars - (halfStar ? 1 : 0))
    const ratingStars = '★'.repeat(fullStars) + halfStar + emptyStars

    this.setData({
      isSpinning: false,
      currentRestaurant: result,
      isFavorite,
      ratingStars
    })
  },

  // 确认选择，记录到历史
  confirmChoice() {
    const { currentRestaurant } = this.data
    if (!currentRestaurant) return
    const app = getApp()
    app.recordVisit(currentRestaurant.id)

    wx.showModal({
      title: '已记录 🎉',
      content: `祝你吃得开心！已将「${currentRestaurant.name}」加入今日记录。`,
      showCancel: false,
      confirmText: '好的'
    })
  },

  // 切换收藏
  toggleFavorite() {
    const { currentRestaurant } = this.data
    if (!currentRestaurant) return
    const app = getApp()
    const nowFav = app.toggleFavorite(currentRestaurant.id)
    this.setData({ isFavorite: nowFav })
    wx.showToast({
      title: nowFav ? '已收藏 ❤️' : '已取消收藏',
      icon: 'none',
      duration: 1500
    })
  },

  // 拉黑当前餐厅并重新推荐
  blacklistCurrent() {
    const { currentRestaurant } = this.data
    if (!currentRestaurant) return
    wx.showModal({
      title: '不想吃这家？',
      content: `将「${currentRestaurant.name}」加入黑名单，以后不会再推荐。`,
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          getApp().toggleBlacklist(currentRestaurant.id)
          wx.showToast({ title: '已加入黑名单', icon: 'none' })
          this.rollRandom()
        }
      }
    })
  },

  // 跳转到详情页
  goToDetail() {
    const { currentRestaurant } = this.data
    if (!currentRestaurant) return
    wx.navigateTo({
      url: `/pages/detail/detail?id=${currentRestaurant.id}`
    })
  }
})
