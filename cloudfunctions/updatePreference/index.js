// cloudfunctions/updatePreference/index.js
// 更新用户偏好设置（收藏/黑名单/历史记录），存储至云数据库

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const {
    action,        // 'toggleFavorite' | 'toggleBlacklist' | 'recordVisit' | 'updateSettings'
    restaurantId,  // 餐厅 id
    settings       // 偏好设置对象（仅 updateSettings 时使用）
  } = event

  try {
    const userCollection = db.collection('user_preferences')

    // 查询是否已有该用户的偏好记录
    const existing = await userCollection.where({ openid }).get()

    if (existing.data.length === 0) {
      // 新建用户记录
      await userCollection.add({
        data: {
          openid,
          favorites: [],
          blacklist: [],
          history: {},
          settings: { maxPrice: 100, favoriteCuisines: [] },
          createTime: db.serverDate()
        }
      })
    }

    let updateData = { updateTime: db.serverDate() }

    if (action === 'toggleFavorite') {
      const record = (await userCollection.where({ openid }).get()).data[0]
      let favorites = record.favorites || []
      const idx = favorites.indexOf(restaurantId)
      if (idx >= 0) {
        favorites.splice(idx, 1)
      } else {
        favorites.push(restaurantId)
      }
      updateData.favorites = favorites
    }

    if (action === 'toggleBlacklist') {
      const record = (await userCollection.where({ openid }).get()).data[0]
      let blacklist = record.blacklist || []
      const idx = blacklist.indexOf(restaurantId)
      if (idx >= 0) {
        blacklist.splice(idx, 1)
      } else {
        blacklist.push(restaurantId)
      }
      updateData.blacklist = blacklist
    }

    if (action === 'recordVisit') {
      updateData[`history.${restaurantId}`] = db.serverDate()
    }

    if (action === 'updateSettings' && settings) {
      updateData.settings = settings
    }

    await userCollection.where({ openid }).update({ data: updateData })

    // 返回最新偏好
    const updated = (await userCollection.where({ openid }).get()).data[0]
    return {
      code: 0,
      data: {
        favorites: updated.favorites || [],
        blacklist: updated.blacklist || [],
        settings: updated.settings || {}
      }
    }
  } catch (err) {
    console.error('[updatePreference] Error:', err)
    return { code: -1, message: err.message }
  }
}
