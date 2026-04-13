// cloudfunctions/getRecommendation/index.js
// 智能推荐云函数：根据用户偏好、历史记录、黑名单，加权随机推荐一家餐厅

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const {
    mealType = 'lunch',   // 'lunch' | 'dinner'
    blacklist = [],       // 黑名单餐厅 id 列表
    favorites = [],       // 收藏餐厅 id 列表
    history = {},         // 历史访问 {id: timestamp}
    maxPrice,             // 最高人均价格
    category              // 品类偏好
  } = event

  try {
    // 从云数据库拉取候选餐厅
    let whereClause = {
      isActive: db.command.neq(false)
    }

    if (category && category !== '全部') {
      whereClause.category = category
    }

    if (maxPrice) {
      whereClause.avgPrice = db.command.lte(Number(maxPrice))
    }

    const result = await db.collection('restaurants')
      .where(whereClause)
      .limit(100)
      .get()

    let pool = result.data

    // 过滤黑名单
    pool = pool.filter(r => !blacklist.includes(r._id) && !blacklist.includes(r.id))

    // 按用餐时段过滤
    if (mealType === 'lunch' || mealType === 'dinner') {
      const filtered = pool.filter(r => r.meals && r.meals.includes(mealType))
      if (filtered.length > 0) pool = filtered
    }

    if (pool.length === 0) {
      return { code: 0, data: null, message: '没有符合条件的餐厅' }
    }

    // 计算推荐权重
    const weights = pool.map(r => calcWeight(r, history, favorites))

    // 加权随机选择
    const selected = weightedRandom(pool, weights)

    return { code: 0, data: selected }
  } catch (err) {
    console.error('[getRecommendation] Error:', err)
    return { code: -1, message: err.message, data: null }
  }
}

function calcWeight(restaurant, history, favorites) {
  const id = restaurant._id || restaurant.id
  let weight = 1.0
  const lastVisit = history[id]
  if (lastVisit) {
    const daysSince = (Date.now() - lastVisit) / (1000 * 60 * 60 * 24)
    weight = Math.min(daysSince / 7, 1.0)
  }
  if (favorites.includes(id)) weight *= 1.5
  weight *= (restaurant.rating || 4) / 5
  return Math.max(weight, 0.05)
}

function weightedRandom(items, weights) {
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}
