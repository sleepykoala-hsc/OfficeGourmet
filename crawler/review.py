#!/usr/bin/env python3
"""
餐厅数据校对工具
用于检查、修改或删除 crawler/data/restaurants.json 中的每一条记录。

用法:
    python review.py                       # 使用默认路径
    python review.py path/to/file.json    # 指定 JSON 文件路径
"""

import json
import os
import sys
from copy import deepcopy
from typing import Any

DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "data", "restaurants.json")
SAMPLE_PATH = os.path.join(os.path.dirname(__file__), "data", "sample_restaurants.json")

# ── ANSI 颜色 ──────────────────────────────────────────────────────────────────
RESET = "\033[0m"
BOLD = "\033[1m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
RED = "\033[91m"
DIM = "\033[2m"


def colored(text: str, *codes: str) -> str:
    return "".join(codes) + str(text) + RESET


def hr(char: str = "─", width: int = 60) -> str:
    return colored(char * width, DIM)


# ── 数据加载 / 保存 ────────────────────────────────────────────────────────────

def load_data(path: str) -> list[dict]:
    if not os.path.exists(path):
        print(colored(f"[警告] 文件不存在: {path}", YELLOW))
        if path == DEFAULT_PATH and os.path.exists(SAMPLE_PATH):
            answer = input(colored(f"  是否使用示例文件 {SAMPLE_PATH}？[y/N] ", YELLOW)).strip().lower()
            if answer == "y":
                return load_data(SAMPLE_PATH)
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        print(colored("[错误] JSON 顶层必须是数组", RED))
        sys.exit(1)
    return data


def save_data(path: str, data: list[dict]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    print(colored(f"  ✓ 已保存到 {path}", GREEN))


# ── 类型感知解析 ───────────────────────────────────────────────────────────────

def parse_value(raw: str, original: Any) -> Any:
    """根据原始值的类型尝试解析用户输入。"""
    if isinstance(original, bool):
        return raw.strip().lower() in ("true", "1", "yes", "是", "y")
    if isinstance(original, int):
        try:
            return int(raw)
        except ValueError:
            pass
    if isinstance(original, float):
        try:
            return float(raw)
        except ValueError:
            pass
    if isinstance(original, list):
        # 以中文逗号或英文逗号分隔
        items = [item.strip() for item in raw.replace("，", ",").split(",") if item.strip()]
        # 如果列表元素是数字，保持类型
        if original and isinstance(original[0], (int, float)):
            try:
                return [type(original[0])(i) for i in items]
            except ValueError:
                pass
        return items
    # str / None / 其他
    stripped = raw.strip()
    if stripped.lower() == "null" or stripped == "":
        # 空输入：str 字段保留空串，None 字段保留 None
        return None if original is None else stripped
    return stripped


def format_value(v: Any) -> str:
    if isinstance(v, list):
        if not v:
            return colored("[]", DIM)
        return colored(f"[{', '.join(str(i) for i in v)}]", CYAN)
    if isinstance(v, bool):
        return colored(str(v), GREEN if v else DIM)
    if v is None or v == "":
        return colored("(空)", DIM)
    return colored(str(v), CYAN)


# ── 显示单条记录 ───────────────────────────────────────────────────────────────

def print_record(idx: int, total: int, record: dict) -> None:
    print()
    print(hr())
    print(colored(f"  [{idx + 1}/{total}]  ", BOLD) + colored(record.get("name", "(无名称)"), BOLD + YELLOW))
    print(hr())
    keys = list(record.keys())
    width = max(len(k) for k in keys) + 2
    for i, k in enumerate(keys):
        num = colored(f"  {i + 1:>2}.", DIM)
        key = colored(f"{k:<{width}}", BOLD)
        val = format_value(record[k])
        print(f"{num} {key} {val}")
    print(hr())


# ── 主菜单：记录列表 ───────────────────────────────────────────────────────────

def print_list(data: list[dict], page: int, page_size: int = 20) -> int:
    total = len(data)
    pages = max(1, (total + page_size - 1) // page_size)
    page = max(0, min(page, pages - 1))
    start = page * page_size
    end = min(start + page_size, total)

    print()
    print(colored(f"  餐厅列表  共 {total} 条  第 {page + 1}/{pages} 页", BOLD))
    print(hr())
    for i in range(start, end):
        r = data[i]
        num = colored(f"  {i + 1:>3}.", DIM)
        name = colored(f"{r.get('name', '?'):<14}", BOLD)
        cat = colored(f"{r.get('category', ''):<8}", CYAN)
        cuisine = colored(f"{r.get('cuisine', ''):<8}", DIM)
        active = "" if r.get("isActive", True) else colored(" [停用]", RED)
        print(f"{num} {name} {cat} {cuisine}{active}")
    print(hr())
    hints = []
    if page > 0:
        hints.append("p=上一页")
    if page < pages - 1:
        hints.append("n=下一页")
    hints += ["编号=查看/编辑", "q=退出"]
    print(colored("  " + "  ".join(hints), DIM))
    return page


# ── 记录编辑界面 ───────────────────────────────────────────────────────────────

def edit_record(data: list[dict], idx: int, path: str) -> bool:
    """
    返回 True 表示继续留在当前记录（字段已修改），
    返回 False 表示返回列表。
    """
    while True:
        record = data[idx]
        total = len(data)
        print_record(idx, total, record)

        nav = []
        if idx > 0:
            nav.append("< 上一条")
        if idx < total - 1:
            nav.append("下一条 >")
        nav += ["字段编号=编辑字段", "d=删除本条", "b=返回列表"]
        print(colored("  " + "  ".join(nav), DIM))
        print()

        raw = input("  请输入操作: ").strip().lower()

        if raw in ("b", ""):
            return False

        if raw == "d":
            confirm = input(colored(f"  确认删除「{record.get('name')}」？[y/N] ", RED)).strip().lower()
            if confirm == "y":
                deleted = data.pop(idx)
                save_data(path, data)
                print(colored(f"  ✓ 已删除「{deleted.get('name')}」", GREEN))
                return False
            print(colored("  已取消", DIM))
            continue

        if raw in ("<", "p", "prev") and idx > 0:
            idx -= 1
            continue
        if raw in (">", "n", "next") and idx < total - 1:
            idx += 1
            continue

        # 数字 → 编辑字段
        try:
            field_no = int(raw) - 1
        except ValueError:
            print(colored("  无效输入，请重试", YELLOW))
            continue

        keys = list(record.keys())
        if field_no < 0 or field_no >= len(keys):
            print(colored("  字段编号超出范围", YELLOW))
            continue

        key = keys[field_no]
        old_val = record[key]
        print()
        print(colored(f"  字段: {key}", BOLD))
        print(colored(f"  当前值: ", DIM) + format_value(old_val))

        if isinstance(old_val, list):
            print(colored("  (列表类型：用逗号分隔多个值，输入空格或空行清空列表)", DIM))
        elif isinstance(old_val, bool):
            print(colored("  (布尔类型：输入 true/false 或 yes/no)", DIM))

        raw_val = input("  新值（直接回车取消）: ")
        if raw_val == "":
            print(colored("  已取消", DIM))
            continue

        new_val = parse_value(raw_val, old_val)
        data[idx][key] = new_val
        save_data(path, data)
        print(colored(f"  ✓ {key} = {format_value(new_val)}", GREEN))


# ── 主循环 ─────────────────────────────────────────────────────────────────────

def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    path = os.path.abspath(path)

    data = load_data(path)
    print(colored(f"\n  已加载 {len(data)} 条记录  来源: {path}", GREEN))

    page = 0
    page_size = 20

    while True:
        page = print_list(data, page, page_size)
        print()
        raw = input("  请输入操作: ").strip().lower()

        if raw == "q":
            print(colored("  再见！", DIM))
            break
        if raw in ("n", "next"):
            page += 1
            continue
        if raw in ("p", "prev"):
            page -= 1
            continue

        try:
            record_no = int(raw) - 1
        except ValueError:
            print(colored("  无效输入，请重试", YELLOW))
            continue

        if record_no < 0 or record_no >= len(data):
            print(colored("  编号超出范围", YELLOW))
            continue

        edit_record(data, record_no, path)


if __name__ == "__main__":
    main()
