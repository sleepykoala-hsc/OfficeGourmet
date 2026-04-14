// utils/weather.js
// 天气查询工具 —— 查询徐汇区实时天气，判断是否为下雨天

// 高德天气 API（需配置 key）
// 徐汇区 adcode: 310104
const XUHUI_ADCODE = '310104'

// 默认 API Key 占位（实际使用时替换为真实 key）
// 也可在 app.js globalData 或 storage 中配置
const DEFAULT_AMAP_KEY = 'YOUR_AMAP_WEATHER_KEY'

/**
 * 获取高德天气 API Key
 * 优先从 storage 读取，fallback 到默认值
 */
const getAmapKey = () => {
  return wx.getStorageSync('amapWeatherKey') || DEFAULT_AMAP_KEY
}

/**
 * 下雨天气关键字列表
 * 高德天气 API 返回的 weather 字段包含以下关键字时视为下雨
 */
const RAIN_KEYWORDS = ['小雨', '中雨', '大雨', '暴雨', '大暴雨', '特大暴雨',
  '阵雨', '雷阵雨', '冻雨', '雨夹雪', '雨']

/**
 * 查询徐汇区当前天气
 * @returns {Promise<{weather: string, temperature: string, isRainy: boolean, error?: string}>}
 */
const getXuhuiWeather = () => {
  return new Promise((resolve) => {
    const key = getAmapKey()

    // 如果没有配置 API Key，默认返回非下雨（不影响推荐逻辑）
    if (!key || key === 'YOUR_AMAP_WEATHER_KEY') {
      resolve({
        weather: '未知',
        temperature: '',
        isRainy: false,
        error: '未配置天气 API Key'
      })
      return
    }

    wx.request({
      url: 'https://restapi.amap.com/v3/weather/weatherInfo',
      data: {
        city: XUHUI_ADCODE,
        key: key,
        extensions: 'base',
        output: 'JSON'
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.status === '1') {
          const lives = res.data.lives
          if (lives && lives.length > 0) {
            const current = lives[0]
            const weather = current.weather || ''
            const isRainy = RAIN_KEYWORDS.some(kw => weather.includes(kw))
            resolve({
              weather,
              temperature: current.temperature || '',
              isRainy
            })
            return
          }
        }
        // API 返回异常时默认非下雨
        resolve({
          weather: '查询失败',
          temperature: '',
          isRainy: false,
          error: 'API 返回异常'
        })
      },
      fail: () => {
        // 网络异常时默认非下雨
        resolve({
          weather: '查询失败',
          temperature: '',
          isRainy: false,
          error: '网络请求失败'
        })
      }
    })
  })
}

/**
 * 检查当前是否为下雨天（简便方法）
 * @returns {Promise<boolean>}
 */
const isRainyNow = async () => {
  const result = await getXuhuiWeather()
  return result.isRainy
}

module.exports = {
  getXuhuiWeather,
  isRainyNow,
  RAIN_KEYWORDS
}
