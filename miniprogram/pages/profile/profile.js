// pages/profile/profile.js
const { restaurants: localRestaurants } = require('../../data/restaurants')
const util = require('../../utils/util')

// 菜系配置（固定顺序 + 颜色）
const CUISINE_CONFIG = [
  { name: '食堂', color: '#FF6B35' },
  { name: '面食', color: '#4CAF50' },
  { name: '广式', color: '#2196F3' },
  { name: '台式', color: '#9C27B0' },
  { name: '日式', color: '#E91E63' },
  { name: '快餐', color: '#FFC107' },
  { name: '其他', color: '#607D8B' }
]

const MIN_SEGMENT_PCT = 2 // 每个菜系最小 2%

Page({
  data: {
    totalVisits: 0,
    favoriteCount: 0,
    blacklistCount: 0,
    recentList: [],
    preferences: {
      maxPrice: 100,
      favoriteCuisines: []
    },
    allCuisineTypes: CUISINE_CONFIG.map(c => c.name),
    // 多段条形滑块
    cuisineSegments: [],   // [{name, color, percent}]
    dividers: [],          // 累积百分比分隔点 (length = CUISINE_CONFIG.length - 1)
    // 菜系权重 { cuisineType: percentage }
    cuisineWeights: {},
    // 特殊规则开关
    specialRules: {
      burgerDay: false,
      coffeeTime: false,
      eatBetter: false
    }
  },

  onShow() {
    this.loadData()
  },

  onReady() {
    // 延迟获取滑块条的位置信息，确保渲染完成
    setTimeout(() => this._cacheBarRect(), 300)
  },

  _cacheBarRect() {
    const query = wx.createSelectorQuery()
    query.select('#sliderTrack').boundingClientRect(rect => {
      if (rect) {
        this._barLeft = rect.left
        this._barWidth = rect.width
      }
    }).exec()
  },

  loadData() {
    const favorites = wx.getStorageSync('favorites') || []
    const blacklist = wx.getStorageSync('blacklist') || []
    const history = wx.getStorageSync('history') || {}
    const historyList = wx.getStorageSync('historyList') || []
    const preferences = wx.getStorageSync('preferences') || {
      maxPrice: 100,
      favoriteCuisines: []
    }

    // 菜系权重
    let cuisineWeights = wx.getStorageSync('cuisineWeights')
    if (!cuisineWeights || Object.keys(cuisineWeights).length === 0) {
      cuisineWeights = this._getDefaultWeights()
      wx.setStorageSync('cuisineWeights', cuisineWeights)
    }

    // 特殊规则
    const specialRules = wx.getStorageSync('specialRules') || {
      burgerDay: false,
      coffeeTime: false,
      eatBetter: false
    }

    // 最近访问列表
    const restaurants = wx.getStorageSync('restaurants') || localRestaurants
    const recentList = historyList
      .slice(0, 8)
      .map(id => {
        const r = restaurants.find(r => r.id === id)
        if (!r) return null
        return {
          ...r,
          lastVisitText: util.formatRelativeTime(history[id])
        }
      })
      .filter(Boolean)

    // 从 cuisineWeights 构建滑块数据
    const { segments, dividers } = this._weightsToSlider(cuisineWeights)

    this.setData({
      totalVisits: Object.keys(history).length,
      favoriteCount: favorites.length,
      blacklistCount: blacklist.length,
      recentList,
      preferences,
      cuisineWeights,
      cuisineSegments: segments,
      dividers,
      specialRules
    })

    // 数据加载后重新缓存条位置
    setTimeout(() => this._cacheBarRect(), 100)
  },

  // 获取默认菜系权重（7 类均匀分配）
  _getDefaultWeights() {
    const weights = {}
    const n = CUISINE_CONFIG.length
    const each = Math.floor(100 / n)
    CUISINE_CONFIG.forEach((c, i) => {
      weights[c.name] = i === n - 1 ? 100 - each * (n - 1) : each
    })
    return weights
  },

  // cuisineWeights → {segments, dividers}
  _weightsToSlider(cuisineWeights) {
    const segments = []
    const dividers = []
    let cumulative = 0
    CUISINE_CONFIG.forEach((c, i) => {
      const pct = cuisineWeights[c.name] || Math.floor(100 / CUISINE_CONFIG.length)
      segments.push({ name: c.name, color: c.color, percent: pct })
      cumulative += pct
      if (i < CUISINE_CONFIG.length - 1) {
        dividers.push(cumulative)
      }
    })
    return { segments, dividers }
  },

  // dividers → segments + cuisineWeights
  _dividersToWeights(dividers) {
    const segments = []
    const weights = {}
    CUISINE_CONFIG.forEach((c, i) => {
      let pct
      if (i === 0) {
        pct = dividers[0]
      } else if (i === CUISINE_CONFIG.length - 1) {
        pct = 100 - dividers[dividers.length - 1]
      } else {
        pct = dividers[i] - dividers[i - 1]
      }
      pct = Math.round(pct)
      segments.push({ name: c.name, color: c.color, percent: pct })
      weights[c.name] = pct
    })
    return { segments, weights }
  },

  // —— 多段滑块触摸事件 ——

  onSliderTouchStart(e) {
    if (!this._barWidth) {
      this._cacheBarRect()
      return
    }
    const touch = e.touches[0]
    const touchX = touch.clientX - this._barLeft
    const touchPct = Math.max(0, Math.min(100, (touchX / this._barWidth) * 100))

    // 找到最近的分隔点
    const dividers = this.data.dividers
    let nearestIdx = 0
    let minDist = Infinity
    for (let i = 0; i < dividers.length; i++) {
      const dist = Math.abs(dividers[i] - touchPct)
      if (dist < minDist) {
        minDist = dist
        nearestIdx = i
      }
    }
    this._activeDivider = nearestIdx
  },

  onSliderTouchMove(e) {
    if (this._activeDivider == null || this._activeDivider < 0 || !this._barWidth) return

    const touch = e.touches[0]
    const touchX = touch.clientX - this._barLeft
    let pct = Math.max(0, Math.min(100, (touchX / this._barWidth) * 100))

    const dividers = [...this.data.dividers]
    const i = this._activeDivider

    // 限制不能越过相邻分隔点（保留最小间距）
    const minVal = i > 0 ? dividers[i - 1] + MIN_SEGMENT_PCT : MIN_SEGMENT_PCT
    const maxVal = i < dividers.length - 1 ? dividers[i + 1] - MIN_SEGMENT_PCT : 100 - MIN_SEGMENT_PCT
    pct = Math.max(minVal, Math.min(maxVal, pct))
    pct = Math.round(pct)

    dividers[i] = pct
    const { segments } = this._dividersToWeights(dividers)
    this.setData({ dividers, cuisineSegments: segments })
  },

  onSliderTouchEnd() {
    this._activeDivider = -1
    // 保存到 storage
    const { weights } = this._dividersToWeights(this.data.dividers)
    wx.setStorageSync('cuisineWeights', weights)
    this.setData({ cuisineWeights: weights })
  },

  onMaxPriceChange(e) {
    const maxPrice = e.detail.value
    const preferences = { ...this.data.preferences, maxPrice }
    wx.setStorageSync('preferences', preferences)
    this.setData({ preferences })
  },

  toggleCuisine(e) {
    const cuisine = e.currentTarget.dataset.cuisine
    let favoriteCuisines = [...this.data.preferences.favoriteCuisines]
    const idx = favoriteCuisines.indexOf(cuisine)
    if (idx >= 0) {
      favoriteCuisines.splice(idx, 1)
    } else {
      favoriteCuisines.push(cuisine)
    }
    const preferences = { ...this.data.preferences, favoriteCuisines }
    wx.setStorageSync('preferences', preferences)
    this.setData({ preferences })
  },

  resetCuisineWeights() {
    const cuisineWeights = this._getDefaultWeights()
    wx.setStorageSync('cuisineWeights', cuisineWeights)
    const { segments, dividers } = this._weightsToSlider(cuisineWeights)
    this.setData({ cuisineWeights, cuisineSegments: segments, dividers })
    wx.showToast({ title: '已重置为均匀分配', icon: 'none' })
  },

  // —— 特殊规则开关 ——

  toggleBurgerDay(e) {
    const specialRules = { ...this.data.specialRules, burgerDay: e.detail.value }
    wx.setStorageSync('specialRules', specialRules)
    this.setData({ specialRules })
  },

  toggleCoffeeTime(e) {
    const specialRules = { ...this.data.specialRules, coffeeTime: e.detail.value }
    wx.setStorageSync('specialRules', specialRules)
    this.setData({ specialRules })
  },

  toggleEatBetter(e) {
    const specialRules = { ...this.data.specialRules, eatBetter: e.detail.value }
    wx.setStorageSync('specialRules', specialRules)
    this.setData({ specialRules })
  },

  clearHistory() {
    wx.showModal({
      title: '确认清除？',
      content: '将清除所有用餐历史记录，不影响收藏和黑名单。',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('history', {})
          wx.setStorageSync('historyList', [])
          this.loadData()
          wx.showToast({ title: '已清除历史', icon: 'none' })
        }
      }
    })
  },

  viewBlacklist() {
    const restaurants = wx.getStorageSync('restaurants') || localRestaurants
    const blacklist = wx.getStorageSync('blacklist') || []
    if (blacklist.length === 0) {
      wx.showToast({ title: '黑名单为空 😊', icon: 'none' })
      return
    }
    const names = blacklist
      .map(id => restaurants.find(r => r.id === id)?.name || '未知餐厅')
      .join('、')
    wx.showModal({
      title: `黑名单 (${blacklist.length}家)`,
      content: names,
      cancelText: '全部移除',
      confirmText: '关闭',
      success: (res) => {
        if (res.cancel) {
          wx.setStorageSync('blacklist', [])
          this.loadData()
          wx.showToast({ title: '已清空黑名单', icon: 'none' })
        }
      }
    })
  },

  viewFavorites() {
    const favorites = wx.getStorageSync('favorites') || []
    if (favorites.length === 0) {
      wx.showToast({ title: '还没有收藏哦', icon: 'none' })
      return
    }
    wx.showToast({ title: `已收藏 ${favorites.length} 家`, icon: 'none' })
  },

  syncRestaurants() {
    wx.showLoading({ title: '同步中...' })
    if (!wx.cloud) {
      wx.hideLoading()
      wx.showToast({ title: '需要开通云开发', icon: 'none' })
      return
    }
    wx.cloud.callFunction({
      name: 'getRestaurants',
      data: {},
      success: (res) => {
        wx.hideLoading()
        if (res.result && res.result.data) {
          wx.setStorageSync('restaurants', res.result.data)
          this.loadData()
          wx.showToast({ title: `已同步 ${res.result.data.length} 家`, icon: 'success' })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '同步失败，使用本地数据', icon: 'none' })
      }
    })
  },

  resetAll() {
    wx.showModal({
      title: '⚠️ 确认重置？',
      content: '将清除所有收藏、黑名单、历史记录和偏好设置，不可恢复！',
      confirmText: '确认重置',
      cancelText: '取消',
      confirmColor: '#f44336',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('favorites', [])
          wx.setStorageSync('blacklist', [])
          wx.setStorageSync('history', {})
          wx.setStorageSync('historyList', [])
          wx.setStorageSync('preferences', { maxPrice: 100, favoriteCuisines: [] })
          wx.setStorageSync('cuisineWeights', {})
          wx.setStorageSync('specialRules', { burgerDay: false, coffeeTime: false, eatBetter: false })
          this.loadData()
          wx.showToast({ title: '已重置', icon: 'success' })
        }
      }
    })
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  }
})
