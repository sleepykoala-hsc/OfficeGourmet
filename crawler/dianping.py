#!/usr/bin/env python3
"""
大众点评数据补全模块
通过大众点评 Web 页面获取餐厅的评分、推荐菜、团购信息和关键评论。

工作流程:
    1. 根据店名 + 城市在大众点评搜索
    2. 从搜索结果中匹配目标餐厅
    3. 进入详情页提取评分、推荐菜、团购、评论

依赖: requests, beautifulsoup4, lxml
"""

import re
import time
import hashlib
import logging
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────
# 请求配置
# ──────────────────────────────────────────────────

# ──────────────────────────────────────────────────
# 常量
# ──────────────────────────────────────────────────

# 评论文本最大长度
MAX_REVIEW_LENGTH = 200
# 截断时最短句子长度（低于此值不在句号/逗号处截断）
MIN_SENTENCE_CUT_POS = 50
# 去重时评论相似度阈值
REVIEW_SIMILARITY_THRESHOLD = 0.6

_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://www.dianping.com/",
}

# 大众点评城市代码映射（主要城市）
_CITY_IDS = {
    "北京": 2, "上海": 1, "广州": 4, "深圳": 7, "天津": 10,
    "杭州": 5, "南京": 9, "成都": 8, "武汉": 12, "西安": 17,
    "重庆": 132, "苏州": 6, "长沙": 26, "郑州": 30, "青岛": 13,
    "沈阳": 15, "大连": 19, "宁波": 29, "厦门": 21, "福州": 25,
    "济南": 33, "昆明": 31, "哈尔滨": 14, "合肥": 36,
    "无锡": 11, "东莞": 123, "佛山": 78, "常州": 35,
}


class DianpingClient:
    """大众点评数据获取客户端"""

    BASE_URL = "https://www.dianping.com"

    def __init__(self, cookie: str = "", request_delay: float = 3.0,
                 max_reviews: int = 2):
        """
        Args:
            cookie: 大众点评登录 Cookie 字符串
            request_delay: 每次请求间隔秒数
            max_reviews: 每家餐厅最多提取几条关键评论
        """
        self._session = requests.Session()
        self._session.headers.update(_DEFAULT_HEADERS)
        if cookie:
            self._session.headers["Cookie"] = cookie
        self._delay = request_delay
        self._max_reviews = max_reviews
        self._last_request_time = 0.0

    # ──────────────────────────────────────────────
    # 公开接口
    # ──────────────────────────────────────────────

    def enrich_restaurant(self, name: str, city: str,
                          address: str = "") -> dict:
        """
        根据店名和城市获取大众点评补充数据。

        Args:
            name: 店铺名（来自高德 API）
            city: 城市名（如"北京"）
            address: 店铺地址（用于辅助匹配）

        Returns:
            包含补充数据的字典，可能包含以下字段:
            {
                "dpRating": 4.5,
                "dpReviewCount": 356,
                "cuisine": "川菜",
                "recommendDishes": ["水煮鱼", "麻婆豆腐"],
                "hasDeal": True,
                "deals": [{"title": "双人餐", "price": 99.0, ...}],
                "keyReviews": ["味道很好...", "环境不错..."],
                "dpUrl": "https://www.dianping.com/shop/12345",
                "avgPrice": 68
            }
            获取失败时返回空字典。
        """
        try:
            shop_url = self._search_shop(name, city, address)
            if not shop_url:
                logger.warning("  ⚠️  大众点评未找到: %s", name)
                return {}

            detail = self._parse_shop_detail(shop_url)
            detail["dpUrl"] = shop_url
            return detail

        except requests.RequestException as exc:
            logger.error("  ❌ 大众点评请求异常: %s — %s", name, exc)
            return {}
        except Exception as exc:
            logger.error("  ❌ 大众点评解析异常: %s — %s", name, exc)
            return {}

    # ──────────────────────────────────────────────
    # 搜索匹配
    # ──────────────────────────────────────────────

    def _search_shop(self, name: str, city: str,
                     address: str = "") -> str:
        """搜索大众点评，返回最匹配餐厅的详情页 URL（或空串）"""
        city_id = _CITY_IDS.get(city, "")
        if not city_id:
            # 尝试模糊匹配城市名
            for city_name, cid in _CITY_IDS.items():
                if city_name in city or city in city_name:
                    city_id = cid
                    break
        if not city_id:
            logger.warning("  ⚠️  未知城市 '%s'，跳过大众点评搜索", city)
            return ""

        encoded_name = quote(name)
        search_url = (
            f"{self.BASE_URL}/search/keyword/{city_id}/0_"
            f"{encoded_name}"
        )

        self._throttle()
        resp = self._session.get(search_url, timeout=15)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")
        return self._match_from_search_results(soup, name, address)

    def _match_from_search_results(self, soup: BeautifulSoup,
                                   target_name: str,
                                   target_address: str) -> str:
        """从搜索结果页中匹配目标餐厅，返回详情页 URL"""
        # 搜索结果列表容器（大众点评搜索页常见结构）
        shop_items = soup.select(
            '[class*="shopItem"], [class*="shop-list"] li, '
            '#shop-all-list li, .shop-list li, '
            '[data-shopid], .content .tit a[href*="/shop/"]'
        )

        best_url = ""
        best_score = 0.0

        # 策略1: 从结构化搜索结果中提取
        for item in shop_items:
            link = item.select_one(
                'a[href*="/shop/"], .tit a, .shopname a, '
                'h4 a, .title a'
            )
            if not link:
                # item 自身可能就是链接
                if item.name == "a" and "/shop/" in item.get("href", ""):
                    link = item
                else:
                    continue

            href = link.get("href", "")
            if "/shop/" not in href:
                continue

            link_text = link.get_text(strip=True)
            score = self._similarity(target_name, link_text)

            # 如果有地址信息，额外验证
            # 按"号"分割取第一段（中文地址中"xx路xx号"是主要定位信息）
            if target_address:
                addr_el = item.select_one(
                    '.addr, .address, [class*="addr"]'
                )
                if addr_el:
                    addr_text = addr_el.get_text(strip=True)
                    if any(seg in addr_text for seg in
                           target_address.split("号")[:1]):
                        score += 0.2

            if score > best_score:
                best_score = score
                best_url = href

        # 策略2: 从所有链接中寻找 /shop/ 链接
        if best_score < 0.4:
            for a_tag in soup.find_all("a", href=True):
                href = a_tag.get("href", "")
                if "/shop/" not in href:
                    continue
                text = a_tag.get_text(strip=True)
                if not text:
                    continue
                score = self._similarity(target_name, text)
                if score > best_score:
                    best_score = score
                    best_url = href

        if best_score < 0.3:
            return ""

        # 确保完整 URL
        if best_url and not best_url.startswith("http"):
            best_url = self.BASE_URL + best_url

        return best_url

    # ──────────────────────────────────────────────
    # 详情页解析
    # ──────────────────────────────────────────────

    def _parse_shop_detail(self, shop_url: str) -> dict:
        """解析大众点评商户详情页，提取补充数据"""
        self._throttle()
        resp = self._session.get(shop_url, timeout=15)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")
        result = {}

        # ── 评分 ──
        rating = self._extract_rating(soup)
        if rating:
            result["dpRating"] = rating

        # ── 评论数 ──
        review_count = self._extract_review_count(soup)
        if review_count:
            result["dpReviewCount"] = review_count

        # ── 人均价格 ──
        avg_price = self._extract_avg_price(soup)
        if avg_price:
            result["avgPrice"] = avg_price

        # ── 菜系 ──
        cuisine = self._extract_cuisine(soup)
        if cuisine:
            result["cuisine"] = cuisine

        # ── 推荐菜 ──
        dishes = self._extract_recommend_dishes(soup)
        if dishes:
            result["recommendDishes"] = dishes

        # ── 团购信息 ──
        deals = self._extract_deals(soup)
        result["hasDeal"] = len(deals) > 0
        if deals:
            result["deals"] = deals

        # ── 关键评论 ──
        reviews = self._extract_key_reviews(soup)
        if reviews:
            result["keyReviews"] = reviews[:self._max_reviews]

        return result

    def _extract_rating(self, soup: BeautifulSoup) -> float:
        """提取总体评分"""
        # 方法1: 结构化评分元素
        for selector in [
            '.score .star_score .item',
            '[class*="star_score"]',
            '[class*="rating"]',
            '.shop-star .star',
            '#TextRating',
        ]:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(strip=True)
                match = re.search(r'(\d+\.?\d*)', text)
                if match:
                    val = float(match.group(1))
                    if val <= 5.0:
                        return round(val, 1)
                    if val <= 50:
                        # 大众点评部分页面（移动端/旧版）用口味/环境/
                        # 服务分展示，满分10分显示为整数形式（如45→4.5）
                        return round(val / 10.0, 1)

        # 方法2: 从 CSS 类名中提取 (class="star_40" 代表4.0分)
        star_el = soup.select_one('[class*="star_"]')
        if star_el:
            for cls in star_el.get("class", []):
                match = re.search(r'star_(\d+)', cls)
                if match:
                    return round(float(match.group(1)) / 10.0, 1)

        # 方法3: 从 JSON-LD 或 script 标签中提取
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                import json
                data = json.loads(script.string or "")
                if "ratingValue" in str(data):
                    rating = data.get("aggregateRating", {}).get(
                        "ratingValue"
                    )
                    if rating:
                        return round(float(rating), 1)
            except (ValueError, TypeError, KeyError):
                pass

        return 0.0

    def _extract_review_count(self, soup: BeautifulSoup) -> int:
        """提取评论数"""
        for selector in [
            '#TextReviewCount',
            '[class*="review-count"]',
            '[class*="reviewCount"]',
            '.score .review-num',
        ]:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(strip=True)
                match = re.search(r'(\d+)', text)
                if match:
                    return int(match.group(1))

        # 从页面文本中提取 "xxx条评价"
        text = soup.get_text()
        match = re.search(r'(\d+)\s*条[评点]', text)
        if match:
            return int(match.group(1))

        return 0

    def _extract_avg_price(self, soup: BeautifulSoup) -> int:
        """提取人均消费"""
        for selector in [
            '#TextAvgCost',
            '.avgprice',
            '[class*="avgPrice"]',
            '[class*="avg-price"]',
            '.price .num',
        ]:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(strip=True)
                match = re.search(r'(\d+)', text)
                if match:
                    return int(match.group(1))

        # 在页面文本中搜索 "人均¥XX" 或 "人均XX元"
        text = soup.get_text()
        match = re.search(r'人均[¥￥]?\s*(\d+)', text)
        if match:
            return int(match.group(1))

        return 0

    def _extract_cuisine(self, soup: BeautifulSoup) -> str:
        """提取菜系"""
        for selector in [
            '.breadcrumb a',
            '[class*="cuisine"]',
            '.shop-crumbs a',
            '.nav-tabs a.active',
        ]:
            elements = soup.select(selector)
            for el in elements:
                text = el.get_text(strip=True)
                # 过滤掉"首页"、"餐厅"等通用词
                if text and text not in ("首页", "餐厅", "美食", "大众点评"):
                    if any(kw in text for kw in
                           ("菜", "料理", "火锅", "烧烤", "快餐",
                            "面", "小吃", "西餐", "日", "韩", "泰")):
                        return text

        return ""

    def _extract_recommend_dishes(self, soup: BeautifulSoup) -> list:
        """提取推荐菜品"""
        dishes = []

        # 方法1: 推荐菜区域
        for selector in [
            '.recommendDish a',
            '.recommend-dish a',
            '[class*="recommend"] .dish-name',
            '[class*="rcmd"] a',
            '.rec-dishes a',
            '.hot-dishes a',
        ]:
            elements = soup.select(selector)
            for el in elements:
                dish = el.get_text(strip=True)
                if dish and len(dish) <= 20 and dish not in dishes:
                    dishes.append(dish)

        # 方法2: 从"推荐菜"标签后提取
        if not dishes:
            for tag in soup.find_all(string=re.compile(r'推荐菜|招牌菜')):
                parent = tag.parent
                if parent:
                    sibling_links = parent.find_next_siblings("a")
                    if not sibling_links:
                        # 尝试从父级容器找
                        container = parent.parent
                        if container:
                            sibling_links = container.find_all("a")
                    for a in sibling_links[:8]:
                        dish = a.get_text(strip=True)
                        if dish and len(dish) <= 20 and dish not in dishes:
                            dishes.append(dish)

        return dishes[:8]  # 最多8道推荐菜

    def _extract_deals(self, soup: BeautifulSoup) -> list:
        """提取团购/优惠信息"""
        deals = []

        for selector in [
            '.deals .deal-item',
            '[class*="deal"] .item',
            '.tuan-list li',
            '[class*="coupon"] .item',
            '.group-buy li',
        ]:
            items = soup.select(selector)
            for item in items:
                deal = self._parse_deal_item(item)
                if deal:
                    deals.append(deal)

        # 如果没有找到结构化团购，尝试从文本中提取
        if not deals:
            deal_section = soup.find(
                string=re.compile(r'团购|优惠|套餐')
            )
            if deal_section:
                parent = deal_section.find_parent(
                    ["div", "section", "ul"]
                )
                if parent:
                    for a in parent.find_all("a")[:5]:
                        title = a.get_text(strip=True)
                        if title and ("元" in title or "套餐" in title
                                      or "团" in title):
                            price_match = re.search(
                                r'[¥￥]?\s*(\d+\.?\d*)', title
                            )
                            deals.append({
                                "title": title[:50],
                                "price": (float(price_match.group(1))
                                          if price_match else 0),
                            })

        return deals[:5]  # 最多5个团购

    def _parse_deal_item(self, item) -> dict:
        """解析单个团购/优惠条目"""
        title_el = item.select_one(
            '.title, .deal-title, h3, h4, .name, a'
        )
        title = title_el.get_text(strip=True) if title_el else ""
        if not title:
            title = item.get_text(strip=True)[:50]
        if not title:
            return {}

        # 提取价格
        price = 0.0
        price_el = item.select_one(
            '.price, .deal-price, .num, [class*="price"]'
        )
        if price_el:
            match = re.search(
                r'[¥￥]?\s*(\d+\.?\d*)', price_el.get_text()
            )
            if match:
                price = float(match.group(1))

        # 提取原价
        original_price = 0.0
        orig_el = item.select_one(
            '.original-price, .old-price, del, s, [class*="origin"]'
        )
        if orig_el:
            match = re.search(
                r'[¥￥]?\s*(\d+\.?\d*)', orig_el.get_text()
            )
            if match:
                original_price = float(match.group(1))

        deal = {"title": title[:50]}
        if price:
            deal["price"] = price
        if original_price:
            deal["originalPrice"] = original_price

        return deal

    def _extract_key_reviews(self, soup: BeautifulSoup) -> list:
        """提取关键评论（选取最有价值的1-2条）"""
        reviews = []

        # 方法1: 精选评论/推荐评论区域
        for selector in [
            '.comment-list .comment-txt',
            '.review-list .review-content',
            '[class*="comment"] .content',
            '[class*="review"] .txt',
            '.user-comment .desc',
        ]:
            elements = soup.select(selector)
            for el in elements:
                text = el.get_text(strip=True)
                text = self._clean_review_text(text)
                if text and len(text) >= 10:
                    reviews.append(text)

        # 方法2: 从所有 <p>、<span> 中提取看起来像评论的文本
        if not reviews:
            candidates = soup.select(
                '.comment p, .review p, '
                '[class*="comment"] p, [class*="review"] p'
            )
            for el in candidates:
                text = el.get_text(strip=True)
                text = self._clean_review_text(text)
                if text and len(text) >= 15:
                    reviews.append(text)

        # 按评论质量排序（长度适中的优先）
        reviews = self._rank_reviews(reviews)
        return reviews

    # ──────────────────────────────────────────────
    # 辅助函数
    # ──────────────────────────────────────────────

    def _throttle(self):
        """请求限速"""
        elapsed = time.time() - self._last_request_time
        if elapsed < self._delay:
            time.sleep(self._delay - elapsed)
        self._last_request_time = time.time()

    @staticmethod
    def _similarity(name_a: str, name_b: str) -> float:
        """计算两个店名的相似度 (0~1)"""
        if not name_a or not name_b:
            return 0.0

        # 清理括号内容和常见后缀
        clean_pattern = r'[（(][^）)]*[）)]|店$|餐厅$|饭店$|美食$'
        a = re.sub(clean_pattern, '', name_a).strip()
        b = re.sub(clean_pattern, '', name_b).strip()

        if not a or not b:
            return 0.0

        # 完全匹配
        if a == b:
            return 1.0

        # 包含关系
        if a in b or b in a:
            shorter = min(len(a), len(b))
            longer = max(len(a), len(b))
            return 0.7 + 0.3 * (shorter / longer)

        # 字符级 Jaccard 相似度
        set_a = set(a)
        set_b = set(b)
        intersection = set_a & set_b
        union = set_a | set_b
        if not union:
            return 0.0
        return len(intersection) / len(union)

    @staticmethod
    def _clean_review_text(text: str) -> str:
        """清理评论文本"""
        # 去除多余空白
        text = re.sub(r'\s+', ' ', text).strip()
        # 去除常见无意义前缀
        text = re.sub(r'^(该用户|此用户|匿名用户)[^，。,\.]*[，。,\.]?\s*',
                       '', text)
        # 截断过长文本
        if len(text) > MAX_REVIEW_LENGTH:
            # 在句号或逗号处截断
            cut = text[:MAX_REVIEW_LENGTH].rfind("。")
            if cut < MIN_SENTENCE_CUT_POS:
                cut = text[:MAX_REVIEW_LENGTH].rfind("，")
            if cut < MIN_SENTENCE_CUT_POS:
                cut = MAX_REVIEW_LENGTH
            text = text[:cut + 1]
        return text

    @staticmethod
    def _rank_reviews(reviews: list) -> list:
        """按评论质量排序，选取最有价值的评论"""
        if not reviews:
            return []

        def review_score(text: str) -> float:
            score = 0.0
            length = len(text)
            # 长度适中的评论优先（30~150字最佳）
            if 30 <= length <= 150:
                score += 3.0
            elif 15 <= length < 30:
                score += 1.5
            elif length > 150:
                score += 2.0
            # 包含具体内容加分
            if re.search(r'[好棒赞不错推荐值得]', text):
                score += 1.0
            if re.search(r'[菜饭面汤肉鱼虾]', text):
                score += 1.0
            if re.search(r'[难差烂贵慢脏]', text):
                score += 0.5  # 负面评论也有价值
            if re.search(r'\d+[元块]', text):
                score += 0.5  # 提到价格
            return score

        scored = [(review_score(r), r) for r in reviews]
        scored.sort(key=lambda x: x[0], reverse=True)

        # 去重（避免相似内容）
        result = []
        for _, text in scored:
            if not any(DianpingClient._similarity(text, existing)
                   > REVIEW_SIMILARITY_THRESHOLD
                       for existing in result):
                result.append(text)

        return result
