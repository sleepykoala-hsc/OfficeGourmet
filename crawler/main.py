#!/usr/bin/env python3
"""
OfficeGourmet 餐厅数据爬虫
使用高德地图 API 获取办公室附近的餐饮 POI 数据，
可选大众点评补全评分、推荐菜、团购和关键评论。

使用方法:
    1. 在 config.py 中填写 AMAP_API_KEY 和 OFFICE_LOCATION
    2. pip install -r requirements.txt
    3. python main.py          # 仅高德数据
    4. python main.py --dp     # 高德 + 大众点评补全

输出:
    data/restaurants.json  —  可直接导入微信小程序或云数据库
"""

import argparse
import json
import logging
import os
import sys
import time
import math
import requests

try:
    from config import (
        AMAP_API_KEY,
        OFFICE_LOCATION,
        SEARCH_RADIUS,
        RESTAURANT_TYPES,
        MAX_RESULTS,
        OUTPUT_FILE,
        PRICE_PER_LEVEL,
    )
except ImportError:
    print("❌ 未找到 config.py！请先复制模板文件：")
    print("   cp config.example.py config.py")
    print("   然后编辑 config.py 填入您的配置。")
    sys.exit(1)

# 大众点评相关配置（可选）
try:
    from config import (
        ENABLE_DIANPING,
        DIANPING_COOKIE,
        DIANPING_REQUEST_DELAY,
        DIANPING_MAX_REVIEWS,
    )
except ImportError:
    ENABLE_DIANPING = False
    DIANPING_COOKIE = ""
    DIANPING_REQUEST_DELAY = 3
    DIANPING_MAX_REVIEWS = 2

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)

# POI 类型到小程序分类的映射
CATEGORY_MAP = {
    "中餐厅": "中式",
    "火锅": "中式",
    "川菜": "中式",
    "粤菜": "粤式",
    "湘菜": "中式",
    "东北菜": "中式",
    "面馆": "中式",
    "快餐": "西式快餐",
    "肯德基": "西式快餐",
    "麦当劳": "西式快餐",
    "日本料理": "日式",
    "寿司": "日式",
    "拉面": "日式",
    "韩国料理": "韩式",
    "烤肉": "韩式",
    "西餐": "西式",
    "意大利菜": "西式",
    "东南亚菜": "东南亚",
    "素食": "素食",
    "台湾菜": "台式",
}

# 分类对应 emoji
EMOJI_MAP = {
    "中式": "🍜",
    "粤式": "🍲",
    "日式": "🍣",
    "韩式": "🥩",
    "西式": "🍝",
    "西式快餐": "🍔",
    "东南亚": "🍛",
    "素食": "🥗",
    "台式": "🍚",
}


def get_restaurants_from_amap(page: int = 1) -> dict:
    """调用高德地图周边搜索 API"""
    location = f"{OFFICE_LOCATION['longitude']},{OFFICE_LOCATION['latitude']}"
    url = "https://restapi.amap.com/v3/place/around"
    params = {
        "key": AMAP_API_KEY,
        "location": location,
        "types": RESTAURANT_TYPES,
        "radius": SEARCH_RADIUS,
        "sortrule": "distance",
        "offset": 25,  # 每页数量
        "page": page,
        "extensions": "all",  # 返回详细信息
    }
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def calc_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    """计算两点间距离（米）"""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return int(R * c)


def parse_poi(poi: dict) -> dict:
    """将高德 POI 数据转换为小程序所需格式"""
    # 解析经纬度
    location = poi.get("location", "0,0").split(",")
    lng, lat = float(location[0]), float(location[1])

    distance = calc_distance(
        OFFICE_LOCATION["latitude"],
        OFFICE_LOCATION["longitude"],
        lat, lng
    )

    # 判断品类
    raw_type = poi.get("type", "")
    category = "中式"
    for key, val in CATEGORY_MAP.items():
        if key in raw_type or key in poi.get("name", ""):
            category = val
            break

    # 价格等级 (1-5)
    biz_ext = poi.get("biz_ext", {})
    try:
        avg_price = float(biz_ext.get("cost", "0") or "0")
    except (ValueError, TypeError):
        avg_price = 0.0
    price_level = min(max(round(avg_price / PRICE_PER_LEVEL), 1), 5) if avg_price > 0 else 2

    # 评分
    try:
        rating = float(biz_ext.get("rating", "4.0") or "4.0")
    except (ValueError, TypeError):
        rating = 4.0

    # 营业时间
    open_time = poi.get("biz_ext", {}).get("open_time", "11:00-21:00") or "11:00-21:00"

    # 用餐时段
    meals = []
    if "早餐" in raw_type or "早茶" in raw_type:
        meals.append("breakfast")
    if "早餐" not in raw_type:
        meals.extend(["lunch", "dinner"])

    return {
        "id": poi.get("id", ""),
        "name": poi.get("name", "未知餐厅"),
        "category": category,
        "cuisine": raw_type.split(";")[0] if ";" in raw_type else raw_type[:6],
        "priceLevel": price_level,
        "avgPrice": int(avg_price) if avg_price > 0 else 25,
        "rating": round(rating, 1),
        "ratingCount": 0,  # 高德 API 免费版不返回评价数
        "tags": _generate_tags(poi, category),
        "meals": meals,
        "distance": distance,
        "address": poi.get("address", ""),
        "phone": poi.get("tel", ""),
        "openHours": open_time,
        "description": f"{poi.get('name', '')}，位于{poi.get('address', '')}，距办公室约{distance}米。",
        "emoji": EMOJI_MAP.get(category, "🍽️"),
        "latitude": lat,
        "longitude": lng,
        "isActive": True,
        # 大众点评补全字段（初始为空，由 enrich_with_dianping 填充）
        "dpRating": 0,
        "dpReviewCount": 0,
        "recommendDishes": [],
        "hasDeal": False,
        "deals": [],
        "keyReviews": [],
        "dpUrl": "",
    }


def _generate_tags(poi: dict, category: str) -> list:
    """根据 POI 信息自动生成标签"""
    tags = []
    name = poi.get("name", "")
    raw_type = poi.get("type", "")

    keyword_tags = {
        "快餐": "快出餐", "火锅": "适合聚餐", "烧烤": "适合聚餐",
        "素食": "健康", "便当": "实惠", "自助": "自助餐",
        "面": "面食", "饺子": "北方口味", "粥": "养生",
    }
    for keyword, tag in keyword_tags.items():
        if keyword in name or keyword in raw_type:
            tags.append(tag)

    if not tags:
        tags = [category]

    return tags[:4]  # 最多 4 个标签


def enrich_with_dianping(restaurants: list) -> list:
    """使用大众点评数据补全餐厅信息"""
    from dianping import DianpingClient

    print(f"\n🔗 开始大众点评数据补全（共 {len(restaurants)} 家）...")
    if not DIANPING_COOKIE:
        print("  ⚠️  未设置 DIANPING_COOKIE，部分页面可能无法访问")
        print("  💡 建议在 config.py 中设置 Cookie 以获取更完整的数据\n")

    client = DianpingClient(
        cookie=DIANPING_COOKIE,
        request_delay=DIANPING_REQUEST_DELAY,
        max_reviews=DIANPING_MAX_REVIEWS,
    )

    city = OFFICE_LOCATION.get("city", "北京")
    enriched_count = 0

    for i, restaurant in enumerate(restaurants):
        name = restaurant["name"]
        address = restaurant.get("address", "")
        print(f"  [{i + 1}/{len(restaurants)}] {name}...", end=" ")

        dp_data = client.enrich_restaurant(name, city, address)

        if dp_data:
            # 合并大众点评数据（仅更新非空字段）
            if dp_data.get("dpRating"):
                restaurant["dpRating"] = dp_data["dpRating"]
            if dp_data.get("dpReviewCount"):
                restaurant["dpReviewCount"] = dp_data["dpReviewCount"]
                restaurant["ratingCount"] = dp_data["dpReviewCount"]
            if dp_data.get("avgPrice") and restaurant["avgPrice"] <= 25:
                restaurant["avgPrice"] = dp_data["avgPrice"]
                restaurant["priceLevel"] = min(
                    max(round(dp_data["avgPrice"] / PRICE_PER_LEVEL), 1), 5
                )
            if dp_data.get("cuisine"):
                restaurant["cuisine"] = dp_data["cuisine"]
            if dp_data.get("recommendDishes"):
                restaurant["recommendDishes"] = dp_data["recommendDishes"]
            restaurant["hasDeal"] = dp_data.get("hasDeal", False)
            if dp_data.get("deals"):
                restaurant["deals"] = dp_data["deals"]
            if dp_data.get("keyReviews"):
                restaurant["keyReviews"] = dp_data["keyReviews"]
            if dp_data.get("dpUrl"):
                restaurant["dpUrl"] = dp_data["dpUrl"]

            enriched_count += 1
            print("✅")
        else:
            print("⏭️  未找到")

    print(f"\n📊 大众点评补全完成: {enriched_count}/{len(restaurants)} 家成功")
    return restaurants


def crawl_and_save(use_dianping: bool = False):
    """主爬取流程"""
    if AMAP_API_KEY == "YOUR_AMAP_API_KEY_HERE":
        print("⚠️  请先在 config.py 中设置 AMAP_API_KEY！")
        print("📖 使用示例数据代替...")
        _use_sample_data()
        return

    print(f"🔍 开始抓取 {OFFICE_LOCATION['city']} 附近 {SEARCH_RADIUS}m 内的餐厅...")

    all_restaurants = []
    page = 1

    while len(all_restaurants) < MAX_RESULTS:
        print(f"  获取第 {page} 页...")
        try:
            data = get_restaurants_from_amap(page)
        except requests.RequestException as e:
            print(f"  ❌ 请求失败: {e}")
            break

        if data.get("status") != "1":
            print(f"  ❌ API 返回错误: {data.get('info', 'unknown')}")
            break

        pois = data.get("pois", [])
        if not pois:
            print("  ✅ 已获取全部数据")
            break

        for poi in pois:
            parsed = parse_poi(poi)
            all_restaurants.append(parsed)

        total_count = int(data.get("count", "0"))
        print(f"  ✅ 本页 {len(pois)} 条，累计 {len(all_restaurants)} 条（共 {total_count} 条）")

        if len(pois) < 25 or len(all_restaurants) >= total_count:
            break

        page += 1
        time.sleep(0.5)  # 避免请求过快

    # 去重
    seen_ids = set()
    unique = []
    for r in all_restaurants:
        if r["id"] not in seen_ids:
            seen_ids.add(r["id"])
            unique.append(r)

    print(f"\n📦 高德地图数据获取完成: {len(unique)} 家餐厅")

    # 大众点评数据补全
    if use_dianping:
        unique = enrich_with_dianping(unique)

    # 保存
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(unique, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 完成！共保存 {len(unique)} 家餐厅数据至 {OUTPUT_FILE}")
    if use_dianping:
        dp_count = sum(1 for r in unique if r.get("dpUrl"))
        print(f"   其中 {dp_count} 家已补全大众点评数据")
    print("\n📤 导入到微信云数据库的步骤：")
    print("   1. 打开微信开发者工具 → 云开发控制台")
    print("   2. 新建集合 'restaurants'")
    print("   3. 点击「导入」→ 选择生成的 JSON 文件")
    print("   4. 导入格式选择 JSON")


def _use_sample_data():
    """没有 API Key 时使用内置示例数据"""
    sample_file = "data/sample_restaurants.json"
    if os.path.exists(sample_file):
        import shutil
        shutil.copy(sample_file, OUTPUT_FILE)
        print(f"✅ 已将示例数据复制到 {OUTPUT_FILE}")
    else:
        print(f"❌ 示例数据文件不存在: {sample_file}")


def main():
    parser = argparse.ArgumentParser(
        description="OfficeGourmet 餐厅数据爬虫"
    )
    parser.add_argument(
        "--dp", "--dianping",
        action="store_true",
        dest="dianping",
        help="启用大众点评数据补全（评分、推荐菜、团购、关键评论）",
    )
    args = parser.parse_args()

    use_dp = args.dianping or ENABLE_DIANPING
    crawl_and_save(use_dianping=use_dp)


if __name__ == "__main__":
    main()
