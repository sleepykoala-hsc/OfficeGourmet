# crawler/config.example.py
# 爬虫配置模板文件
# 使用时复制为 config.py 并填入真实值：
#   cp config.example.py config.py

# 高德地图 Web API Key（勿提交 config.py！）
# 申请地址: https://lbs.amap.com/dev/key/app
AMAP_API_KEY = "YOUR_AMAP_API_KEY_HERE"

# 办公室位置（经度, 纬度）
# 查询方式: 打开高德地图，右键目标位置 → 复制经纬度
OFFICE_LOCATION = {
    "longitude": 116.310905,
    "latitude": 39.992806,
    "city": "北京"
}

# 搜索半径（米）
SEARCH_RADIUS = 800

# 餐饮 POI 类型代码（高德）
RESTAURANT_TYPES = "050000"  # 餐饮服务大类

# 价格等级计算：每级对应的价格区间（元）
PRICE_PER_LEVEL = 30

# 最多抓取条数
MAX_RESULTS = 100

# 输出文件路径
OUTPUT_FILE = "data/restaurants.json"

# ──────────────────────────────────────────────────
# 大众点评数据补全（可选）
# ──────────────────────────────────────────────────

# 是否启用大众点评数据补全（评分、推荐菜、团购、关键评论）
ENABLE_DIANPING = False

# 大众点评 Cookie（登录后从浏览器复制）
# 获取方式：
#   1. 浏览器打开 https://www.dianping.com 并登录
#   2. F12 → Network → 任意请求 → Headers → Cookie
#   3. 复制完整 Cookie 字符串粘贴到下面
DIANPING_COOKIE = ""

# 每次请求大众点评的间隔（秒），避免触发反爬
DIANPING_REQUEST_DELAY = 3

# 每家餐厅最多提取几条关键评论
DIANPING_MAX_REVIEWS = 2
