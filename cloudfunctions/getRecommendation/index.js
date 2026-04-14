// cloudfunctions/getRecommendation/index.js
// 智能推荐云函数：根据用户偏好、历史记录、黑名单，加权随机推荐一家餐厅
// 实现所有特殊规则（排队过滤、雨天过滤、菜系加权、burger day、coffee time、吃点好的）

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
    cuisineWeights = {},  // 菜系权重 {cuisineType: percentage}
    specialRules = {},    // 特殊规则 {burgerDay, coffeeTime, eatBetter}
    isRainy = false,      // 是否下雨
    filterCuisineType     // UI 菜系过滤
  } = event

  try {
    const now = new Date()

    // 拉取全部餐厅
    const result = await db.collection('restaurants')
      .where({ isActive: db.command.neq(false) })
      .limit(100)
      .get()
    const allRestaurants = result.data

    // —— 规则 (4)[3]："吃点好的" —— 4% 概率无视所有规则
    if (specialRules.eatBetter && Math.random() < 0.04) {
      const expensive = allRestaurants.filter(r =>
        (r.category === '餐厅') &&
        (r.avgPrice > 100) &&
        !blacklist.includes(r._id) && !blacklist.includes(r.id)
      )
      if (expensive.length > 0) {
        const weights = expensive.map(r => calcWeight(r, history, favorites))
        const selected = weightedRandom(expensive, weights)
        const resp = { code: 0, data: selected, ruleApplied: '吃点好的', coffeeShop: null }
        if (specialRules.coffeeTime && Math.random() < 0.1) {
          resp.coffeeShop = pickCoffeeShop(allRestaurants, blacklist, history, favorites)
        }
        return resp
      }
    }

    // —— 基础池：category="餐厅"，avgPrice <= 100 ——
    let pool = allRestaurants.filter(r =>
      (r.category === '餐厅') &&
      (r.avgPrice <= 100) &&
      !blacklist.includes(r._id) && !blacklist.includes(r.id)
    )

    // 按用餐时段过滤
    if (mealType === 'lunch' || mealType === 'dinner') {
      const filtered = pool.filter(r => r.meals && r.meals.includes(mealType))
      if (filtered.length > 0) pool = filtered
    }

    // UI 菜系过滤
    if (filterCuisineType && filterCuisineType !== '全部') {
      const filtered = pool.filter(r => r.cuisineType === filterCuisineType)
      if (filtered.length > 0) pool = filtered
    }

    let ruleApplied = ''

    // —— 规则 (1)：排除"排队"tag ——
    if (shouldExcludeQueue(now)) {
      const filtered = pool.filter(r => !(r.tags && r.tags.includes('排队')))
      if (filtered.length > 0) {
        pool = filtered
        ruleApplied = '避开排队'
      }
    }

    // —— 规则 (2)：下雨天仅推荐室内店铺 ——
    if (isRainy) {
      const indoorTags = ['传媒港', '宝马', '网易']
      const filtered = pool.filter(r => r.tags && r.tags.some(t => indoorTags.includes(t)))
      if (filtered.length > 0) {
        pool = filtered
        ruleApplied = '雨天室内推荐'
      }
    }

    if (pool.length === 0) {
      return { code: 0, data: null, message: '没有符合条件的餐厅', coffeeShop: null }
    }

    // —— 规则 (3) + (4)[1]：菜系加权随机 ——
    const weights = calcCuisineWeightedScores(pool, history, favorites, cuisineWeights, specialRules, now)
    const selected = weightedRandom(pool, weights)
    if (!ruleApplied) ruleApplied = '正常推荐'

    const resp = { code: 0, data: selected, ruleApplied, coffeeShop: null }

    // —— 规则 (4)[2]："coffee time" ——
    if (specialRules.coffeeTime && Math.random() < 0.1) {
      resp.coffeeShop = pickCoffeeShop(allRestaurants, blacklist, history, favorites)
    }

    return resp
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
  if (total <= 0) return items[Math.floor(Math.random() * items.length)]
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function shouldExcludeQueue(now) {
  const day = now.getDay()
  const hour = now.getHours()
  const isLunch = hour >= 11 && hour <= 14
  if (day >= 1 && day <= 4) return true
  if (day === 0 || day === 5 || day === 6) return isLunch
  return false
}

function calcCuisineWeightedScores(pool, history, favorites, cuisineWeights, specialRules, now) {
  const cuisinesInPool = [...new Set(pool.map(r => r.cuisineType))]
  let effectiveWeights = { ...cuisineWeights }

  // Burger Day: 周四将西式快餐提升到80%
  if (specialRules.burgerDay && now.getDay() === 4) {
    const remaining = 20
    const otherCuisines = cuisinesInPool.filter(c => c !== '西式快餐')
    if (otherCuisines.length > 0) {
      const totalOther = otherCuisines.reduce((sum, c) => sum + (effectiveWeights[c] || 10), 0)
      otherCuisines.forEach(c => {
        const orig = effectiveWeights[c] || 10
        effectiveWeights[c] = totalOther > 0 ? (orig / totalOther) * remaining : remaining / otherCuisines.length
      })
    }
    effectiveWeights['西式快餐'] = 80
  }

  const cuisineBaseWeights = {}
  pool.forEach(r => {
    const ct = r.cuisineType
    if (!cuisineBaseWeights[ct]) cuisineBaseWeights[ct] = { totalBase: 0, count: 0 }
    cuisineBaseWeights[ct].totalBase += calcWeight(r, history, favorites)
    cuisineBaseWeights[ct].count++
  })

  return pool.map(r => {
    const ct = r.cuisineType
    const baseWeight = calcWeight(r, history, favorites)
    const cuisinePercent = effectiveWeights[ct] || 10
    const info = cuisineBaseWeights[ct]
    if (info && info.totalBase > 0) {
      return (baseWeight / info.totalBase) * cuisinePercent
    }
    return baseWeight
  })
}

function pickCoffeeShop(allRestaurants, blacklist, history, favorites) {
  const coffeePool = allRestaurants.filter(r =>
    (r.category === '咖啡饮料店') &&
    !blacklist.includes(r._id) && !blacklist.includes(r.id)
  )
  if (coffeePool.length === 0) return null
  const weights = coffeePool.map(r => calcWeight(r, history, favorites))
  return weightedRandom(coffeePool, weights)
}
