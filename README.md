# OfficeGourmet 🍽️
> 今天吃什么？再也不用纠结了！

一款帮助打工人决定工作日午餐/晚餐去哪家店的微信小程序。

## 功能特性

- 🎲 **随机智能推荐** — 根据用餐时段（午餐/晚餐）、历史访问频率和收藏偏好，加权随机推荐一家餐厅
- 🍜 **餐厅列表** — 支持按品类、关键词搜索，按评分/距离/价格排序
- 📋 **餐厅详情** — 展示地址、营业时间、人均价格、特色标签和简介
- ❤️ **收藏与黑名单** — 收藏喜欢的餐厅提高推荐权重；把不想去的餐厅加入黑名单
- 📊 **个人档案** — 查看用餐历史、调整最高价格偏好、管理菜系偏好
- ☁️ **微信云开发** — 云函数 + 云数据库，支持多设备数据同步

## 项目结构

```
OfficeGourmet/
├── miniprogram/          # 微信小程序主体
│   ├── app.js            # 全局 App 对象
│   ├── app.json          # 全局配置
│   ├── app.wxss          # 全局样式
│   ├── pages/
│   │   ├── index/        # 首页（随机推荐）
│   │   ├── list/         # 餐厅列表
│   │   ├── detail/       # 餐厅详情
│   │   └── profile/      # 我的（偏好设置）
│   ├── utils/util.js     # 工具函数（加权随机、推荐算法）
│   └── data/restaurants.js  # 内置示例餐厅数据
├── cloudfunctions/       # 微信云函数
│   ├── getRestaurants/   # 从云数据库获取餐厅列表
│   ├── getRecommendation/# 服务端加权推荐
│   └── updatePreference/ # 同步用户偏好至云端
└── crawler/              # Python 数据爬虫
    ├── main.py           # 高德地图 API 爬虫 + 大众点评补全
    ├── dianping.py       # 大众点评数据获取模块
    ├── config.py         # API Key 和位置配置
    ├── requirements.txt
    └── data/
        └── sample_restaurants.json  # 示例数据（20 家）
```

## 快速开始

### 1. 克隆项目 & 配置小程序

1. 下载 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开项目，选择 `miniprogram/` 目录
3. 在 `project.config.json` 中将 `appid` 替换为你的小程序 AppID

### 2. 配置微信云开发（可选，本地数据不依赖云开发）

1. 在微信开发者工具中开通云开发环境
2. 修改 `miniprogram/app.js` 中的 `env` 为你的云环境 ID：
   ```js
   wx.cloud.init({ env: 'your-env-id' })
   ```
3. 在云开发控制台新建集合 `restaurants` 和 `user_preferences`
4. 右键 `cloudfunctions/getRestaurants`，选择「上传并部署」（三个云函数均需部署）

### 3. 使用爬虫抓取附近餐厅数据

```bash
cd crawler
pip install -r requirements.txt

# 编辑 config.py，填入高德 API Key 和办公室坐标
python main.py
```

运行后会在 `crawler/data/restaurants.json` 生成餐厅数据。

#### 大众点评数据补全（可选）

在高德 POI 基础上，自动补全大众点评的评分、推荐菜、团购信息和关键评论：

```bash
# 方式一：命令行参数启用
python main.py --dp

# 方式二：在 config.py 中设置 ENABLE_DIANPING = True
python main.py
```

为获取更完整的数据，建议在 `config.py` 中配置大众点评 Cookie：
1. 浏览器打开 https://www.dianping.com 并登录
2. F12 → Network → 任意请求 → Headers → 复制 Cookie
3. 粘贴到 `config.py` 的 `DIANPING_COOKIE`

补全后每家餐厅会新增以下字段：
- `dpRating` — 大众点评评分
- `recommendDishes` — 推荐菜品列表
- `hasDeal` / `deals` — 团购信息
- `keyReviews` — 1-2 条最有价值的评论

**导入到云数据库：**

1. 打开微信开发者工具 → 云开发控制台 → 数据库
2. 选择 `restaurants` 集合 → 导入 → 选择生成的 `restaurants.json`
3. 格式选「JSON」，点击「导入」

**无 API Key 时：** 直接使用内置的 `crawler/data/sample_restaurants.json`（20 家示例餐厅）。

### 4. 本地运行

无需云开发也可运行：小程序首次启动会自动将内置的 20 家示例餐厅加载到本地存储，所有功能均可正常使用。

## 高德地图 API Key 申请

1. 访问 [高德开放平台](https://lbs.amap.com/)
2. 注册开发者账号 → 控制台 → 创建应用
3. 添加 Key，服务平台选「Web 服务」
4. 复制 Key 填入 `crawler/config.py` 的 `AMAP_API_KEY`

## 部署方式

### 方式一：微信云开发（推荐）

- 云函数：按调用次数计费，每月有免费额度
- 云数据库：存储餐厅数据和用户偏好
- 无需独立服务器，一键部署

### 方式二：纯本地存储

- 不使用云开发
- 数据存储在用户设备本地（`wx.storage`）
- 无法跨设备同步，但完全离线可用

## 技术栈

- 微信小程序原生开发（WXML / WXSS / JS）
- 微信云开发（云函数 + 云数据库）
- Python 3 + 高德地图 API（数据采集）

