// pages/profile/profile.js
const { restaurants: localRestaurants } = require('../../data/restaurants')
const util = require('../../utils/util')

// 所有菜系类别（用于权重配置）
const ALL_CUISINE_TYPES = ['中式', '日式', '韩式', '西式', '粤式', '台式', '素食', '东南亚', '西式快餐']

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
    allCuisineTypes: ALL_CUISINE_TYPES,
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
      const restaurants = wx.getStorageSync('restaurants') || localRestaurants
      cuisineWeights = util.getDefaultCuisineWeights(restaurants)
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

    this.setData({
      totalVisits: Object.keys(history).length,
      favoriteCount: favorites.length,
      blacklistCount: blacklist.length,
      recentList,
      preferences,
      cuisineWeights,
      specialRules
    })
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

  // —— 菜系权重配置 ——

  onCuisineWeightChange(e) {
    const cuisineType = e.currentTarget.dataset.cuisine
    const value = Number(e.detail.value)
    const cuisineWeights = { ...this.data.cuisineWeights, [cuisineType]: value }
    wx.setStorageSync('cuisineWeights', cuisineWeights)
    this.setData({ cuisineWeights })
  },

  resetCuisineWeights() {
    const restaurants = wx.getStorageSync('restaurants') || localRestaurants
    const cuisineWeights = util.getDefaultCuisineWeights(restaurants)
    wx.setStorageSync('cuisineWeights', cuisineWeights)
    this.setData({ cuisineWeights })
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
    const restaurants = wx.getStorageSync('restaurants') || localRestaurants
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
