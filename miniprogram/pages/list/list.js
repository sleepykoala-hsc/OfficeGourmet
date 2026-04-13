// pages/list/list.js
const { restaurants: localRestaurants } = require('../../data/restaurants')

const CATEGORIES = ['全部', '中式', '日式', '韩式', '西式', '粤式', '台式', '素食', '东南亚', '西式快餐']
const SORT_OPTIONS = [
  { label: '综合', value: 'default' },
  { label: '评分', value: 'rating' },
  { label: '距离', value: 'distance' },
  { label: '价格', value: 'price' }
]

Page({
  data: {
    allRestaurants: [],
    filteredRestaurants: [],
    searchKeyword: '',
    categories: CATEGORIES,
    activeCategory: '全部',
    sortOptions: SORT_OPTIONS,
    sortBy: 'default'
  },

  onLoad() {
    this.loadRestaurants()
  },

  onShow() {
    // 刷新收藏状态（可能在其他页面发生了变化）
    this.refreshFavoriteStatus()
  },

  loadRestaurants() {
    const restaurants = wx.getStorageSync('restaurants') || localRestaurants
    const favorites = wx.getStorageSync('favorites') || []
    const blacklist = wx.getStorageSync('blacklist') || []
    const enriched = restaurants.map(r => ({
      ...r,
      isFavorite: favorites.includes(r.id),
      isBlacklisted: blacklist.includes(r.id)
    }))
    this.allRestaurants = enriched
    this.setData({ allRestaurants: enriched })
    this.applyFilter()
  },

  refreshFavoriteStatus() {
    const favorites = wx.getStorageSync('favorites') || []
    const blacklist = wx.getStorageSync('blacklist') || []
    this.allRestaurants = this.allRestaurants.map(r => ({
      ...r,
      isFavorite: favorites.includes(r.id),
      isBlacklisted: blacklist.includes(r.id)
    }))
    this.applyFilter()
  },

  onSearch(e) {
    this.setData({ searchKeyword: e.detail.value })
    this.applyFilter()
  },

  clearSearch() {
    this.setData({ searchKeyword: '' })
    this.applyFilter()
  },

  setCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({ activeCategory: category })
    this.applyFilter()
  },

  setSort(e) {
    const sort = e.currentTarget.dataset.sort
    this.setData({ sortBy: sort })
    this.applyFilter()
  },

  applyFilter() {
    const { searchKeyword, activeCategory, sortBy } = this.data
    let result = [...this.allRestaurants]

    // 关键词搜索
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(kw) ||
        r.cuisine.toLowerCase().includes(kw) ||
        r.category.toLowerCase().includes(kw) ||
        r.tags.some(t => t.toLowerCase().includes(kw))
      )
    }

    // 分类过滤
    if (activeCategory && activeCategory !== '全部') {
      result = result.filter(r => r.category === activeCategory)
    }

    // 排序
    if (sortBy === 'rating') {
      result.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === 'distance') {
      result.sort((a, b) => a.distance - b.distance)
    } else if (sortBy === 'price') {
      result.sort((a, b) => a.avgPrice - b.avgPrice)
    } else {
      // 默认：收藏的排前面，然后按评分
      result.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1
        if (!a.isFavorite && b.isFavorite) return 1
        return b.rating - a.rating
      })
    }

    this.setData({ filteredRestaurants: result })
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  }
})
