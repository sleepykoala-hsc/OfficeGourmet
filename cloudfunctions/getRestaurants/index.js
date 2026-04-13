// cloudfunctions/getRestaurants/index.js
// 获取餐厅列表云函数
// 从云数据库读取餐厅，支持分类、关键词过滤

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const {
    category,    // 分类筛选
    keyword,     // 关键词搜索
    mealType,    // 'lunch' | 'dinner'
    maxPrice,    // 最高人均价格
    limit = 50,  // 最多返回条数
    skip = 0     // 分页偏移
  } = event

  try {
    let query = db.collection('restaurants').where({
      isActive: db.command.neq(false) // 过滤下架餐厅
    })

    if (category && category !== '全部') {
      query = db.collection('restaurants').where({
        isActive: db.command.neq(false),
        category
      })
    }

    const result = await db.collection('restaurants')
      .where(buildWhereClause(event))
      .orderBy('rating', 'desc')
      .skip(skip)
      .limit(limit)
      .get()

    return {
      code: 0,
      data: result.data,
      total: result.data.length
    }
  } catch (err) {
    console.error('[getRestaurants] Error:', err)
    return {
      code: -1,
      message: err.message,
      data: []
    }
  }
}

function buildWhereClause(event) {
  const { category, maxPrice } = event
  const db = cloud.database()
  const where = {
    isActive: db.command.neq(false)
  }

  if (category && category !== '全部') {
    where.category = category
  }

  if (maxPrice) {
    where.avgPrice = db.command.lte(Number(maxPrice))
  }

  return where
}
