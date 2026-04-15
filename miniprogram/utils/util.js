// utils/util.js

// ===== 特殊规则概率常量 =====
const EAT_BETTER_PROBABILITY = 0.04       // "吃点好的"触发概率 4%
const COFFEE_TIME_PROBABILITY = 0.1        // "coffee time"触发概率 10%
const BURGER_DAY_FAST_FOOD_WEIGHT = 80     // "burger day"快餐权重 80%
const BURGER_DAY_OTHER_WEIGHT = 20         // "burger day"其他菜系权重 20%

// ===== 分类常量 =====
const FOOD_CATEGORIES = ['食堂', '面食', '广式', '台式', '日式', '快餐', '其他']
const DRINK_CATEGORY = '饮料'

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
 * 计算餐厅推荐权重（基础权重，不含菜系加权）
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
  if (restaurants.length === 0) return null
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight <= 0) return restaurants[Math.floor(Math.random() * restaurants.length)]
  let random = Math.random() * totalWeight
  for (let i = 0; i < restaurants.length; i++) {
    random -= weights[i]
    if (random <= 0) return restaurants[i]
  }
  return restaurants[restaurants.length - 1]
}

// ===== 特殊规则相关工具 =====

/**
 * 判断当前是否需要排除"排队"tag的店铺
 * 规则 (1): 周一到周四全天、周五到周日中午，排除"排队"tag
 * @param {Date} [now] 可选传入时间，默认取当前时间
 * @returns {boolean}
 */
const shouldExcludeQueue = (now) => {
  if (!now) now = new Date()
  const day = now.getDay() // 0=Sun, 1=Mon ... 6=Sat
  const hour = now.getHours()
  const isLunch = hour >= 11 && hour <= 14

  // 周一(1) ~ 周四(4)：全天排除
  if (day >= 1 && day <= 4) return true
  // 周五(5) ~ 周日(0, 6)：仅中午排除
  if (day === 0 || day === 5 || day === 6) return isLunch

  return false
}

/**
 * 判断当前是否为 "burger day"（周四）
 * @param {Date} [now]
 * @returns {boolean}
 */
const isBurgerDay = (now) => {
  if (!now) now = new Date()
  return now.getDay() === 4 // 周四
}

/**
 * 判断餐厅是否为食物类（非饮料）
 * @param {object} restaurant
 * @returns {boolean}
 */
const isFood = (restaurant) => {
  return FOOD_CATEGORIES.includes(restaurant.category)
}

/**
 * 判断餐厅是否为饮料店
 * @param {object} restaurant
 * @returns {boolean}
 */
const isDrinkShop = (restaurant) => {
  return restaurant.category === DRINK_CATEGORY
}

/**
 * 获取所有可用的菜系类别（从餐厅数据中提取）
 * @param {object[]} allRestaurants
 * @returns {string[]}
 */
const getAllCuisineTypes = (allRestaurants) => {
  const types = new Set()
  allRestaurants.forEach(r => {
    if (isFood(r)) {
      types.add(r.category)
    }
  })
  return [...types]
}

/**
 * 获取默认的菜系权重配置
 * @param {object[]} allRestaurants
 * @returns {object} { category: weight(%) }
 */
const getDefaultCuisineWeights = (allRestaurants) => {
  const types = getAllCuisineTypes(allRestaurants)
  const weights = {}
  // 默认均匀分配
  const each = Math.floor(100 / types.length)
  types.forEach((t, i) => {
    // 最后一个分配剩余
    weights[t] = i === types.length - 1 ? 100 - each * (types.length - 1) : each
  })
  return weights
}

/**
 * 智能推荐（含全部特殊规则）
 *
 * 规则优先级（序号小 = 优先级高）：
 *   (1) 周一~周四全天、周五~周日中午：排除"排队"tag（非强制，可被更高优先级覆盖）
 *   (2) 下雨天：仅从 tags 含"传媒港"/"宝马"/"网易"的店铺中选（非强制）
 *   (3) 菜系加权随机
 *   (4) 特殊规则（需在设置中勾选才生效）:
 *       [1] burger day  — 周四将快餐概率提升到80%
 *       [2] coffee time — 10%概率额外推荐一家饮料店
 *       [3] 吃点好的    — 4%概率无视所有规则，推荐人均>100的店
 *
 * @param {object} params
 * @param {object[]} params.allRestaurants - 全部餐厅（含饮料店）
 * @param {string}   params.mealType - 'lunch' | 'dinner' | 'other'
 * @param {string[]} params.blacklist - 黑名单 id
 * @param {string[]} params.favorites - 收藏 id
 * @param {object}   params.history   - 历史访问 {id: timestamp}
 * @param {object}   params.cuisineWeights - 菜系权重 {category: percentage}
 * @param {object}   params.specialRules   - 特殊规则开关 {burgerDay, coffeeTime, eatBetter}
 * @param {boolean}  params.isRainy        - 当前是否下雨
 * @param {string}   [params.filterCuisineType] - UI 上选择的菜系过滤
 * @returns {{restaurant: object|null, coffeeShop: object|null, ruleApplied: string}}
 */
const recommend = (params) => {
  const {
    allRestaurants,
    mealType,
    blacklist = [],
    favorites = [],
    history = {},
    cuisineWeights = {},
    specialRules = {},
    isRainy = false,
    filterCuisineType
  } = params

  const now = new Date()
  const result = { restaurant: null, coffeeShop: null, ruleApplied: '' }

  // —— 特殊规则 (4)[3]："吃点好的" ——
  if (specialRules.eatBetter && Math.random() < EAT_BETTER_PROBABILITY) {
    const expensive = allRestaurants.filter(r =>
      isFood(r) &&
      r.avgPrice > 100 &&
      !blacklist.includes(r.id)
    )
    if (expensive.length > 0) {
      const weights = expensive.map(r => calcWeight(r, history, favorites))
      result.restaurant = weightedRandom(expensive, weights)
      result.ruleApplied = '吃点好的'

      // 即使触发"吃点好的"，coffee time 仍然可以触发
      _tryCoffeeTime(result, allRestaurants, blacklist, history, favorites, specialRules)
      return result
    }
    // 如果没有高价店，fallthrough 到正常逻辑
  }

  // —— 基础池：食物类餐厅，avgPrice <= 100 ——
  let pool = allRestaurants.filter(r =>
    isFood(r) &&
    r.avgPrice <= 100 &&
    !blacklist.includes(r.id)
  )

  // 按用餐时段过滤
  if (mealType === 'lunch' || mealType === 'dinner') {
    const filtered = pool.filter(r => r.meals && r.meals.includes(mealType))
    if (filtered.length > 0) pool = filtered
  }

  // UI 菜系过滤（用户在首页手动选择的）
  if (filterCuisineType && filterCuisineType !== '全部') {
    const filtered = pool.filter(r => r.category === filterCuisineType)
    if (filtered.length > 0) pool = filtered
  }

  // —— 规则 (1)：排除"排队"tag ——
  if (shouldExcludeQueue(now)) {
    const filtered = pool.filter(r => !(r.tags && r.tags.includes('排队')))
    if (filtered.length > 0) {
      pool = filtered
      if (!result.ruleApplied) result.ruleApplied = '避开排队'
    }
  }

  // —— 规则 (2)：下雨天仅推荐"传媒港"/"宝马"/"网易"的店 ——
  // 优先级高于规则(1)，但规则(1)已经执行过了（它们不冲突，可叠加）
  if (isRainy) {
    const indoorTags = ['传媒港', '宝马', '网易']
    const filtered = pool.filter(r =>
      r.tags && r.tags.some(t => indoorTags.includes(t))
    )
    if (filtered.length > 0) {
      pool = filtered
      result.ruleApplied = '雨天室内推荐'
    }
  }

  if (pool.length === 0) {
    _tryCoffeeTime(result, allRestaurants, blacklist, history, favorites, specialRules)
    return result
  }

  // —— 规则 (3) + (4)[1]：菜系加权随机 ——
  const weights = _calcCuisineWeightedScores(pool, history, favorites, cuisineWeights, specialRules, now)
  result.restaurant = weightedRandom(pool, weights)
  if (!result.ruleApplied) result.ruleApplied = '正常推荐'

  // —— 规则 (4)[2]："coffee time" ——
  _tryCoffeeTime(result, allRestaurants, blacklist, history, favorites, specialRules)

  return result
}

/**
 * 尝试触发 coffee time（提取为公共逻辑避免重复）
 * @private
 */
const _tryCoffeeTime = (result, allRestaurants, blacklist, history, favorites, specialRules) => {
  if (specialRules.coffeeTime && Math.random() < COFFEE_TIME_PROBABILITY) {
    const coffeeShop = _pickCoffeeShop(allRestaurants, blacklist, history, favorites)
    if (coffeeShop) result.coffeeShop = coffeeShop
  }
}

/**
 * 计算含菜系权重的最终分数
 * @private
 */
const _calcCuisineWeightedScores = (pool, history, favorites, cuisineWeights, specialRules, now) => {
  // 获取池中所有菜系（现在是 category 字段）
  const cuisinesInPool = [...new Set(pool.map(r => r.category))]

  // 构建有效的菜系权重映射
  let effectiveWeights = { ...cuisineWeights }

  // 规则 (4)[1]: burger day — 周四将快餐提升到80%
  if (specialRules.burgerDay && isBurgerDay(now)) {
    const otherCuisines = cuisinesInPool.filter(c => c !== '快餐')

    if (otherCuisines.length > 0) {
      const totalOtherOriginal = otherCuisines.reduce((sum, c) => sum + (effectiveWeights[c] || 10), 0)
      otherCuisines.forEach(c => {
        const original = effectiveWeights[c] || 10
        effectiveWeights[c] = totalOtherOriginal > 0
          ? (original / totalOtherOriginal) * BURGER_DAY_OTHER_WEIGHT
          : BURGER_DAY_OTHER_WEIGHT / otherCuisines.length
      })
    }
    effectiveWeights['快餐'] = BURGER_DAY_FAST_FOOD_WEIGHT
  }

  // 计算每个菜系在池中的总基础权重
  const cuisineBaseWeights = {}
  pool.forEach(r => {
    const ct = r.category
    if (!cuisineBaseWeights[ct]) cuisineBaseWeights[ct] = { totalBase: 0, count: 0 }
    cuisineBaseWeights[ct].totalBase += calcWeight(r, history, favorites)
    cuisineBaseWeights[ct].count++
  })

  // 将菜系配置的百分比权重分配到每家店
  return pool.map(r => {
    const ct = r.category
    const baseWeight = calcWeight(r, history, favorites)
    const cuisinePercent = effectiveWeights[ct] || 10 // 默认10%
    const info = cuisineBaseWeights[ct]

    // 该店的最终权重 = (该店基础权重 / 同菜系总基础权重) × 菜系百分比
    if (info && info.totalBase > 0) {
      return (baseWeight / info.totalBase) * cuisinePercent
    }
    return baseWeight
  })
}

/**
 * 从饮料店中随机选择一家
 * @private
 */
const _pickCoffeeShop = (allRestaurants, blacklist, history, favorites) => {
  const coffeePool = allRestaurants.filter(r =>
    isDrinkShop(r) &&
    !blacklist.includes(r.id)
  )
  if (coffeePool.length === 0) return null
  const weights = coffeePool.map(r => calcWeight(r, history, favorites))
  return weightedRandom(coffeePool, weights)
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
  formatRelativeTime,
  shouldExcludeQueue,
  isBurgerDay,
  getAllCuisineTypes,
  getDefaultCuisineWeights,
  isFood,
  isDrinkShop,
  FOOD_CATEGORIES,
  DRINK_CATEGORY
}
