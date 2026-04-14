// pages/index/index.js
const util = require('../../utils/util')
const { getXuhuiWeather } = require('../../utils/weather')
const { restaurants: localRestaurants } = require('../../data/restaurants')

const SPIN_DURATION = 1500 // 动画时长 ms
const SPIN_INTERVAL = 150  // 每帧间隔 ms

const ALL_EMOJIS = ['🍜', '🍛', '🥗', '🍱', '🍣', '🍔', '🥩', '🍲', '🥟', '🍝']

// 菜系过滤列表（使用 cuisineType）
const CUISINE_TYPES = ['全部', '中式', '日式', '韩式', '西式', '粤式', '台式', '素食', '东南亚', '西式快餐']

Page({
  data: {
    mealType: 'lunch',
    mealTimeLabel: '午餐',
    currentRestaurant: null,
    coffeeShop: null,       // coffee time 额外推荐
    ruleApplied: '',        // 当前生效的规则
    isSpinning: false,
    spinningEmoji: '🎲',
    isFavorite: false,
    ratingStars: '',
    cuisineTypes: CUISINE_TYPES,
    activeCuisineType: '全部',
    weatherInfo: '',        // 天气显示文本
    isRainy: false          // 当前是否下雨
  },

  onLoad() {
    // 根据当前时间自动设置用餐类型
    const mealType = util.getMealTime()
    const validType = mealType === 'other' ? 'lunch' : mealType
    this.setData({
      mealType: validType,
      mealTimeLabel: validType === 'lunch' ? '午餐' : '晚餐'
    })
    // 初次加载查询天气
    this._fetchWeather()
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

  // 查询天气
  _fetchWeather() {
    getXuhuiWeather().then(res => {
      const weatherText = res.error
        ? ''
        : `${res.weather} ${res.temperature}°C`
      this.setData({
        weatherInfo: weatherText,
        isRainy: res.isRainy
      })
    })
  },

  // 切换用餐类型
  setMealType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      mealType: type,
      mealTimeLabel: type === 'lunch' ? '午餐' : '晚餐',
      currentRestaurant: null,
      coffeeShop: null,
      ruleApplied: '',
      activeCuisineType: '全部'
    })
  },

  // 设置菜系筛选
  setCuisineType(e) {
    const cuisineType = e.currentTarget.dataset.cuisinetype
    this.setData({ activeCuisineType: cuisineType })
    // 如果已有推荐，直接重新推荐
    if (this.data.currentRestaurant || this.data.activeCuisineType !== cuisineType) {
      this.rollRandom()
    }
  },

  // 随机推荐
  rollRandom() {
    if (this.data.isSpinning) return
    this.setData({ isSpinning: true, currentRestaurant: null, coffeeShop: null, ruleApplied: '' })

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
    const blacklist = wx.getStorageSync('blacklist') || []
    const favorites = wx.getStorageSync('favorites') || []
    const history = wx.getStorageSync('history') || {}
    const cuisineWeights = wx.getStorageSync('cuisineWeights') || {}
    const specialRules = wx.getStorageSync('specialRules') || {}

    const restaurants = wx.getStorageSync('restaurants') || localRestaurants

    const result = util.recommend({
      allRestaurants: restaurants,
      mealType: this.data.mealType,
      blacklist,
      favorites,
      history,
      cuisineWeights,
      specialRules,
      isRainy: this.data.isRainy,
      filterCuisineType: this.data.activeCuisineType
    })

    if (!result.restaurant) {
      this.setData({ isSpinning: false })
      wx.showToast({ title: '没有找到合适的餐厅', icon: 'none' })
      return
    }

    const r = result.restaurant
    const isFavorite = favorites.includes(r.id)
    const fullStars = Math.floor(r.rating)
    const halfStar = r.rating % 1 >= 0.5 ? '½' : ''
    const emptyStars = '☆'.repeat(5 - fullStars - (halfStar ? 1 : 0))
    const ratingStars = '★'.repeat(fullStars) + halfStar + emptyStars

    this.setData({
      isSpinning: false,
      currentRestaurant: r,
      coffeeShop: result.coffeeShop || null,
      ruleApplied: result.ruleApplied || '',
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
