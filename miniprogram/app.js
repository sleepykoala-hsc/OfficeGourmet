// app.js
const { restaurants: localRestaurants } = require('./data/restaurants')

App({
  onLaunch() {
    // 初始化云开发环境
    if (wx.cloud) {
      wx.cloud.init({
        env: 'officegourmet-prod', // 替换为实际云环境 ID
        traceUser: true
      })
    }

    // 初始化本地存储
    this.initStorage()
  },

  initStorage() {
    // 初始化收藏列表
    if (!wx.getStorageSync('favorites')) {
      wx.setStorageSync('favorites', [])
    }
    // 初始化黑名单
    if (!wx.getStorageSync('blacklist')) {
      wx.setStorageSync('blacklist', [])
    }
    // 初始化历史记录
    if (!wx.getStorageSync('history')) {
      wx.setStorageSync('history', {})
    }
    // 初始化偏好设置
    if (!wx.getStorageSync('preferences')) {
      wx.setStorageSync('preferences', {
        favoriteCuisines: [],
        maxPrice: 100,
        mealTypes: ['lunch', 'dinner']
      })
    }
    // 初始化菜系权重（空对象表示稍后由 profile 页用 getDefaultCuisineWeights 初始化）
    if (!wx.getStorageSync('cuisineWeights')) {
      wx.setStorageSync('cuisineWeights', {})
    }
    // 初始化特殊规则开关
    if (!wx.getStorageSync('specialRules')) {
      wx.setStorageSync('specialRules', {
        burgerDay: false,
        coffeeTime: false,
        eatBetter: false
      })
    }

    // 数据版本检查 —— 当餐厅数据结构变更时递增此值以触发刷新
    // v2: category 字段从菜系名改为 "餐厅"/"咖啡饮料店"，新增 cuisineType 字段
    const DATA_VERSION = 2
    const currentVersion = wx.getStorageSync('dataVersion')
    if (currentVersion !== DATA_VERSION) {
      wx.setStorageSync('restaurants', localRestaurants)
      wx.setStorageSync('dataVersion', DATA_VERSION)
      // 菜系权重需要重置，因为菜系分类可能已变化
      wx.setStorageSync('cuisineWeights', {})
    } else if (!wx.getStorageSync('restaurants')) {
      // 首次使用，写入本地数据
      wx.setStorageSync('restaurants', localRestaurants)
    }
  },

  // 获取餐厅列表（优先云端，降级本地）
  getRestaurants(callback) {
    const local = wx.getStorageSync('restaurants') || localRestaurants
    callback(local)
  },

  // 更新餐厅数据
  updateRestaurants(restaurants) {
    wx.setStorageSync('restaurants', restaurants)
  },

  // 添加/移除收藏
  toggleFavorite(restaurantId) {
    let favorites = wx.getStorageSync('favorites') || []
    const idx = favorites.indexOf(restaurantId)
    if (idx >= 0) {
      favorites.splice(idx, 1)
    } else {
      favorites.push(restaurantId)
    }
    wx.setStorageSync('favorites', favorites)
    return favorites.includes(restaurantId)
  },

  // 添加/移除黑名单
  toggleBlacklist(restaurantId) {
    let blacklist = wx.getStorageSync('blacklist') || []
    const idx = blacklist.indexOf(restaurantId)
    if (idx >= 0) {
      blacklist.splice(idx, 1)
    } else {
      blacklist.push(restaurantId)
    }
    wx.setStorageSync('blacklist', blacklist)
  },

  // 记录访问历史
  recordVisit(restaurantId) {
    let history = wx.getStorageSync('history') || {}
    history[restaurantId] = Date.now()
    wx.setStorageSync('history', history)

    // 同时更新历史列表
    let historyList = wx.getStorageSync('historyList') || []
    historyList = historyList.filter(id => id !== restaurantId)
    historyList.unshift(restaurantId)
    if (historyList.length > 30) historyList = historyList.slice(0, 30)
    wx.setStorageSync('historyList', historyList)
  },

  globalData: {
    userInfo: null
  }
})
