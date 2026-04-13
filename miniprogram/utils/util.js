// utils/util.js

/**
 * 格式化时间
 */
const formatTime = (date) => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute].map(formatNumber).join(':')}`
}

const formatNumber = (n) => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

/**
 * 获取当前用餐时段
 * @returns {'lunch' | 'dinner' | 'other'}
 */
const getMealTime = () => {
  const hour = new Date().getHours()
  if (hour >= 11 && hour <= 14) return 'lunch'
  if (hour >= 17 && hour <= 21) return 'dinner'
  return 'other'
}

/**
 * 根据价格等级返回 ¥ 字符串（纯文本，适用于 WXML）
 * @param {number} level 1-5
 */
const getPriceLevelStr = (level) => {
  return '¥'.repeat(level)
}

/**
 * 根据评分返回星号字符串
 * @param {number} rating
 */
const getStarStr = (rating) => {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5 ? 1 : 0
  const empty = 5 - full - half
  return '★'.repeat(full) + (half ? '☆' : '') + '☆'.repeat(empty)
}

/**
 * 计算餐厅推荐权重
 * 越久没去 → 权重越高；收藏 → 权重×1.5；高评分 → 权重×(rating/5)
 * @param {object} restaurant
 * @param {object} history - {restaurantId: timestamp}
 * @param {string[]} favorites - 收藏的餐厅 id 列表
 */
const calcWeight = (restaurant, history, favorites) => {
  let weight = 1.0
  const lastVisit = history[restaurant.id]
  if (lastVisit) {
    const daysSince = (Date.now() - lastVisit) / (1000 * 60 * 60 * 24)
    // 7 天内线性降低，7 天后恢复满权重
    weight = Math.min(daysSince / 7, 1.0)
  }
  if (favorites && favorites.includes(restaurant.id)) {
    weight *= 1.5
  }
  weight *= restaurant.rating / 5
  return Math.max(weight, 0.05) // 确保始终有机会被选中
}

/**
 * 加权随机选择一家餐厅
 * @param {object[]} restaurants
 * @param {number[]} weights
 * @returns {object}
 */
const weightedRandom = (restaurants, weights) => {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  let random = Math.random() * totalWeight
  for (let i = 0; i < restaurants.length; i++) {
    random -= weights[i]
    if (random <= 0) return restaurants[i]
  }
  return restaurants[restaurants.length - 1]
}

/**
 * 推荐一家餐厅
 * @param {object[]} allRestaurants - 全部餐厅
 * @param {string} mealType - 'lunch' | 'dinner' | 'other'
 * @param {string[]} blacklist - 黑名单 id
 * @param {string[]} favorites - 收藏 id
 * @param {object} history - 历史访问 {id: timestamp}
 * @param {object} preferences - 偏好 {favoriteCuisines, maxPrice}
 * @returns {object | null}
 */
const recommend = (allRestaurants, mealType, blacklist, favorites, history, preferences) => {
  // 过滤黑名单
  let pool = allRestaurants.filter(r => !blacklist.includes(r.id))

  // 按用餐时段过滤（如果有对应时段的餐厅）
  if (mealType === 'lunch' || mealType === 'dinner') {
    const filtered = pool.filter(r => r.meals.includes(mealType))
    if (filtered.length > 0) pool = filtered
  }

  // 按最大价格过滤
  if (preferences && preferences.maxPrice) {
    const filtered = pool.filter(r => r.avgPrice <= preferences.maxPrice)
    if (filtered.length > 0) pool = filtered
  }

  if (pool.length === 0) return null

  // 计算权重
  const weights = pool.map(r => calcWeight(r, history, favorites))

  return weightedRandom(pool, weights)
}

/**
 * 格式化距离
 * @param {number} meters
 */
const formatDistance = (meters) => {
  if (meters < 1000) return `${meters}m`
  return `${(meters / 1000).toFixed(1)}km`
}

/**
 * 格式化相对时间
 * @param {number} timestamp
 */
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '从未去过'
  const diff = Date.now() - timestamp
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  return `${Math.floor(days / 30)}个月前`
}

module.exports = {
  formatTime,
  formatNumber,
  getMealTime,
  getPriceLevelStr,
  getStarStr,
  calcWeight,
  weightedRandom,
  recommend,
  formatDistance,
  formatRelativeTime
}
