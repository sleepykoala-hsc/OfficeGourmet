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

# 可选：大众点评 / 美团 Cookie（如需爬取评分数据）
DIANPING_COOKIE = ""
MEITUAN_COOKIE = ""
