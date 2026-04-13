// pages/detail/detail.js
const { restaurants: localRestaurants } = require('../../data/restaurants')
const util = require('../../utils/util')

Page({
  data: {
    restaurant: null,
    isFavorite: false,
    isBlacklisted: false,
    lastVisitText: ''
  },

  onLoad(options) {
    const { id } = options
    if (!id) return
    this.restaurantId = id
    this.loadRestaurant(id)
  },

  onShow() {
    if (this.restaurantId) {
      this.refreshStatus(this.restaurantId)
    }
  },

  loadRestaurant(id) {
    const restaurants = wx.getStorageSync('restaurants') || localRestaurants
    const restaurant = restaurants.find(r => r.id === id)
    if (!restaurant) return

    const favorites = wx.getStorageSync('favorites') || []
    const blacklist = wx.getStorageSync('blacklist') || []
    const history = wx.getStorageSync('history') || {}

    this.setData({
      restaurant,
      isFavorite: favorites.includes(id),
      isBlacklisted: blacklist.includes(id),
      lastVisitText: util.formatRelativeTime(history[id])
    })

    wx.setNavigationBarTitle({ title: restaurant.name })
  },

  refreshStatus(id) {
    const favorites = wx.getStorageSync('favorites') || []
    const blacklist = wx.getStorageSync('blacklist') || []
    const history = wx.getStorageSync('history') || {}
    this.setData({
      isFavorite: favorites.includes(id),
      isBlacklisted: blacklist.includes(id),
      lastVisitText: util.formatRelativeTime(history[id])
    })
  },

  toggleFavorite() {
    const app = getApp()
    const nowFav = app.toggleFavorite(this.restaurantId)
    this.setData({ isFavorite: nowFav })
    wx.showToast({
      title: nowFav ? '已收藏 ❤️' : '已取消收藏',
      icon: 'none',
      duration: 1500
    })
  },

  toggleBlacklist() {
    const { isBlacklisted, restaurant } = this.data
    if (isBlacklisted) {
      getApp().toggleBlacklist(this.restaurantId)
      this.setData({ isBlacklisted: false })
      wx.showToast({ title: '已从黑名单移除', icon: 'none' })
    } else {
      wx.showModal({
        title: '不想吃这家？',
        content: `将「${restaurant.name}」加入黑名单，首页将不再推荐。`,
        confirmText: '确认',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            getApp().toggleBlacklist(this.restaurantId)
            this.setData({ isBlacklisted: true })
            wx.showToast({ title: '已加入黑名单 🚫', icon: 'none' })
          }
        }
      })
    }
  },

  confirmVisit() {
    const { restaurant } = this.data
    getApp().recordVisit(this.restaurantId)
    const history = wx.getStorageSync('history') || {}
    this.setData({
      lastVisitText: util.formatRelativeTime(history[this.restaurantId])
    })
    wx.showModal({
      title: '已记录 🎉',
      content: `祝你在「${restaurant.name}」吃得开心！`,
      showCancel: false,
      confirmText: '好的'
    })
  }
})
