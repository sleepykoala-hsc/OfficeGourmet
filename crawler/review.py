#!/usr/bin/env python3
"""
餐厅数据校对工具 — GUI 版本
用于检查、修改或删除 crawler/data/restaurants.json 中的每一条记录。

用法:
    python review.py                       # 使用默认路径
    python review.py path/to/file.json    # 指定 JSON 文件路径
"""

import json
import os
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from typing import Any

DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "data", "restaurants.json")
SAMPLE_PATH = os.path.join(os.path.dirname(__file__), "data", "sample_restaurants.json")


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
        if len(original) > 0 and isinstance(original[0], (int, float)):
            try:
                return [type(original[0])(i) for i in items]
            except ValueError:
                pass
        return items
    # str / None / 其他
    stripped = raw.strip()
    if stripped.lower() == "null" or stripped == "":
        return None if original is None else stripped
    return stripped


# ── GUI 主程序 ─────────────────────────────────────────────────────────────────

class ReviewApp(tk.Tk):
    def __init__(self, path: str) -> None:
        super().__init__()
        self.path = path
        self.data: list[dict] = []
        self.current_idx: int = -1
        self.field_vars: dict[str, tk.Variable] = {}
        self.field_originals: dict[str, Any] = {}

        self.title("餐厅数据校对工具")
        self.geometry("1100x720")
        self.minsize(800, 500)

        self._build_ui()
        self._load_data()

    # ── UI 构建 ────────────────────────────────────────────────────────────────

    def _build_ui(self) -> None:
        # 菜单栏
        menubar = tk.Menu(self)
        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="打开文件…", command=self._open_file, accelerator="Ctrl+O")
        file_menu.add_command(label="保存", command=self._save_current, accelerator="Ctrl+S")
        file_menu.add_separator()
        file_menu.add_command(label="退出", command=self.quit)
        menubar.add_cascade(label="文件", menu=file_menu)
        self.config(menu=menubar)
        self.bind("<Control-o>", lambda _e: self._open_file())
        self.bind("<Control-s>", lambda _e: self._save_current())
        # macOS 使用 Command 键
        self.bind("<Command-o>", lambda _e: self._open_file())
        self.bind("<Command-s>", lambda _e: self._save_current())

        # 主分割面板
        paned = ttk.PanedWindow(self, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        # ── 左侧：列表面板 ─────────────────────────────────────────────────────
        left = ttk.Frame(paned, width=300)
        paned.add(left, weight=1)

        # 搜索栏
        search_frame = ttk.Frame(left)
        search_frame.pack(fill=tk.X, padx=4, pady=(4, 0))
        ttk.Label(search_frame, text="搜索:").pack(side=tk.LEFT)
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *_: self._filter_list())
        ttk.Entry(search_frame, textvariable=self.search_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=(4, 0)
        )

        # 餐厅列表
        cols = ("name", "category", "cuisine")
        self.tree = ttk.Treeview(left, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("name", text="名称")
        self.tree.heading("category", text="分类")
        self.tree.heading("cuisine", text="菜系")
        self.tree.column("name", width=130)
        self.tree.column("category", width=70)
        self.tree.column("cuisine", width=70)

        vsb = ttk.Scrollbar(left, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(4, 0), pady=4)
        vsb.pack(side=tk.LEFT, fill=tk.Y, pady=4, padx=(0, 4))
        self.tree.bind("<<TreeviewSelect>>", self._on_tree_select)

        # 列表底部按钮
        btn_frame = ttk.Frame(left)
        btn_frame.pack(fill=tk.X, padx=4, pady=(0, 4))
        ttk.Button(btn_frame, text="新增", command=self._add_record).pack(
            side=tk.LEFT, expand=True, fill=tk.X, padx=(0, 2)
        )
        ttk.Button(btn_frame, text="删除", command=self._delete_record).pack(
            side=tk.LEFT, expand=True, fill=tk.X, padx=(2, 0)
        )

        # ── 右侧：编辑面板 ─────────────────────────────────────────────────────
        right = ttk.Frame(paned)
        paned.add(right, weight=3)

        # 标题栏 + 导航按钮
        toolbar = ttk.Frame(right)
        toolbar.pack(fill=tk.X, padx=6, pady=(6, 0))
        self.lbl_title = ttk.Label(toolbar, text="（请从左侧选择记录）", font=("", 12, "bold"))
        self.lbl_title.pack(side=tk.LEFT)
        ttk.Button(toolbar, text="下一条 ▶", command=self._next).pack(side=tk.RIGHT, padx=(2, 0))
        ttk.Button(toolbar, text="◀ 上一条", command=self._prev).pack(side=tk.RIGHT)

        # 可滚动表单区域
        form_outer = ttk.Frame(right)
        form_outer.pack(fill=tk.BOTH, expand=True, padx=6, pady=4)

        self._canvas = tk.Canvas(form_outer, highlightthickness=0)
        form_vsb = ttk.Scrollbar(form_outer, orient=tk.VERTICAL, command=self._canvas.yview)
        self.form_frame = ttk.Frame(self._canvas)

        self.form_frame.bind(
            "<Configure>",
            lambda _e: self._canvas.configure(scrollregion=self._canvas.bbox("all")),
        )
        self._canvas_window = self._canvas.create_window((0, 0), window=self.form_frame, anchor="nw")
        self._canvas.configure(yscrollcommand=form_vsb.set)
        self._canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        form_vsb.pack(side=tk.RIGHT, fill=tk.Y)

        # 让表单随画布宽度伸缩
        self._canvas.bind(
            "<Configure>",
            lambda e: self._canvas.itemconfig(self._canvas_window, width=e.width),
        )
        # 鼠标滚轮支持
        self._canvas.bind("<Enter>", self._bind_mousewheel)
        self._canvas.bind("<Leave>", self._unbind_mousewheel)

        # 保存按钮 + 状态标签
        save_frame = ttk.Frame(right)
        save_frame.pack(fill=tk.X, padx=6, pady=(0, 4))
        ttk.Button(save_frame, text="保存修改 (Ctrl+S)", command=self._save_current).pack(side=tk.RIGHT)
        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(save_frame, textvariable=self.status_var, foreground="gray").pack(side=tk.LEFT)

        # 底部状态栏
        self.statusbar = ttk.Label(self, text="", relief=tk.SUNKEN, anchor=tk.W)
        self.statusbar.pack(fill=tk.X, side=tk.BOTTOM, padx=2, pady=1)

    def _bind_mousewheel(self, _event: tk.Event) -> None:
        self.bind_all("<MouseWheel>", self._on_mousewheel)
        self.bind_all("<Button-4>", self._on_mousewheel)
        self.bind_all("<Button-5>", self._on_mousewheel)

    def _unbind_mousewheel(self, _event: tk.Event) -> None:
        self.unbind_all("<MouseWheel>")
        self.unbind_all("<Button-4>")
        self.unbind_all("<Button-5>")

    def _on_mousewheel(self, event: tk.Event) -> None:
        if event.num == 4:
            self._canvas.yview_scroll(-1, "units")
        elif event.num == 5:
            self._canvas.yview_scroll(1, "units")
        else:
            self._canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    # ── 数据操作 ───────────────────────────────────────────────────────────────

    def _load_data(self) -> None:
        if not os.path.exists(self.path):
            if self.path == os.path.abspath(DEFAULT_PATH) and os.path.exists(SAMPLE_PATH):
                if messagebox.askyesno("提示", f"文件不存在:\n{self.path}\n\n是否使用示例文件？"):
                    self.path = SAMPLE_PATH
                else:
                    self.quit()
                    return
            else:
                messagebox.showerror("错误", f"文件不存在:\n{self.path}")
                self.quit()
                return

        try:
            with open(self.path, encoding="utf-8") as f:
                self.data = json.load(f)
        except Exception as exc:
            messagebox.showerror("错误", f"无法读取文件:\n{exc}")
            self.quit()
            return

        if not isinstance(self.data, list):
            messagebox.showerror("错误", "JSON 顶层必须是数组")
            self.quit()
            return

        self._populate_list()
        self._set_statusbar(f"已加载 {len(self.data)} 条记录  来源: {self.path}")
        self.title(f"餐厅数据校对工具 — {os.path.basename(self.path)}")

    def _write_file(self) -> None:
        tmp = self.path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)
            self.status_var.set("✓ 已保存")
            self._set_statusbar(f"已保存  {len(self.data)} 条记录  来源: {self.path}")
        except Exception as exc:
            messagebox.showerror("保存失败", str(exc))

    # ── 列表面板 ───────────────────────────────────────────────────────────────

    def _populate_list(self, filter_str: str = "") -> None:
        self.tree.delete(*self.tree.get_children())
        fl = filter_str.lower()
        for i, r in enumerate(self.data):
            name = r.get("name", "?")
            cat = r.get("category", "")
            cuisine = r.get("cuisine", "")
            if fl and fl not in (name + cat + cuisine).lower():
                continue
            active = r.get("isActive", True)
            self.tree.insert(
                "", tk.END, iid=str(i), values=(name, cat, cuisine),
                tags=() if active else ("inactive",),
            )
        self.tree.tag_configure("inactive", foreground="gray")

    def _filter_list(self) -> None:
        self._populate_list(self.search_var.get())

    def _on_tree_select(self, _event: tk.Event = None) -> None:
        sel = self.tree.selection()
        if not sel:
            return
        idx = int(sel[0])
        if idx != self.current_idx:
            self.current_idx = idx
            self._show_record(idx)

    # ── 记录编辑面板 ───────────────────────────────────────────────────────────

    def _show_record(self, idx: int) -> None:
        if idx < 0 or idx >= len(self.data):
            return
        record = self.data[idx]
        self.current_idx = idx
        self.lbl_title.config(text=f"[{idx + 1}/{len(self.data)}]  {record.get('name', '?')}")

        # 清空旧表单
        for w in self.form_frame.winfo_children():
            w.destroy()
        self.field_vars.clear()
        self.field_originals.clear()

        # 逐字段生成输入控件
        for row_idx, (key, val) in enumerate(record.items()):
            ttk.Label(self.form_frame, text=key, anchor="e", width=20).grid(
                row=row_idx, column=0, sticky="ne", padx=(8, 4), pady=3
            )
            self.field_originals[key] = val

            if isinstance(val, bool):
                var: tk.Variable = tk.BooleanVar(value=val)
                ttk.Checkbutton(self.form_frame, variable=var).grid(
                    row=row_idx, column=1, sticky="w", padx=(0, 8), pady=3
                )
            elif isinstance(val, list):
                var = tk.StringVar(value=", ".join(str(i) for i in val))
                entry = ttk.Entry(self.form_frame, textvariable=var)
                entry.grid(row=row_idx, column=1, sticky="ew", padx=(0, 4), pady=3)
                ttk.Label(
                    self.form_frame, text="(逗号分隔)", foreground="gray", font=("", 8)
                ).grid(row=row_idx, column=2, sticky="w", padx=(0, 8), pady=3)
            else:
                var = tk.StringVar(value="" if val is None else str(val))
                ttk.Entry(self.form_frame, textvariable=var).grid(
                    row=row_idx, column=1, sticky="ew", padx=(0, 8), pady=3
                )

            self.field_vars[key] = var

        self.form_frame.columnconfigure(1, weight=1)
        self.status_var.set(f"第 {idx + 1} 条")

        # 同步选中列表中的对应项
        if self.tree.exists(str(idx)):
            self.tree.selection_set(str(idx))
            self.tree.see(str(idx))

        # 回到顶部
        self._canvas.yview_moveto(0)

    def _save_current(self) -> None:
        if self.current_idx < 0:
            return
        record = self.data[self.current_idx]
        for key, var in self.field_vars.items():
            original = self.field_originals.get(key)
            if isinstance(original, bool):
                record[key] = bool(var.get())
            else:
                record[key] = parse_value(str(var.get()), original)
        self._write_file()
        # 刷新列表（名称可能已改变）
        self._populate_list(self.search_var.get())
        self._show_record(self.current_idx)

    def _delete_record(self) -> None:
        if self.current_idx < 0:
            return
        name = self.data[self.current_idx].get("name", "?")
        if not messagebox.askyesno("确认删除", f"确认删除「{name}」？\n此操作将立即写入文件，无法撤销。"):
            return
        self.data.pop(self.current_idx)
        self._write_file()
        # 清空表单，刷新列表
        for w in self.form_frame.winfo_children():
            w.destroy()
        self.field_vars.clear()
        self.field_originals.clear()
        new_idx = min(self.current_idx, len(self.data) - 1)
        self.current_idx = -1
        self._populate_list(self.search_var.get())
        if new_idx >= 0:
            self._show_record(new_idx)
        else:
            self.lbl_title.config(text="（无记录）")

    def _add_record(self) -> None:
        """以第一条记录的结构为模板新增一条空记录。"""
        if not self.data:
            messagebox.showinfo("提示", "暂无记录，请先导入数据")
            return
        template = self.data[0]
        new_rec: dict = {}
        for k, v in template.items():
            if isinstance(v, bool):
                new_rec[k] = False
            elif isinstance(v, int):
                new_rec[k] = 0
            elif isinstance(v, float):
                new_rec[k] = 0.0
            elif isinstance(v, list):
                new_rec[k] = []
            elif isinstance(v, str):
                new_rec[k] = ""
            else:
                new_rec[k] = None
        new_rec["name"] = "新餐厅"
        # 若同名已存在，追加递增编号使名称唯一
        existing = {r.get("name", "") for r in self.data}
        if new_rec["name"] in existing:
            n = 1
            while f"新餐厅_{n}" in existing:
                n += 1
            new_rec["name"] = f"新餐厅_{n}"
        self.data.append(new_rec)
        self._write_file()
        self._populate_list(self.search_var.get())
        self._show_record(len(self.data) - 1)

    def _prev(self) -> None:
        if self.current_idx > 0:
            self._show_record(self.current_idx - 1)

    def _next(self) -> None:
        if self.current_idx < len(self.data) - 1:
            self._show_record(self.current_idx + 1)

    def _open_file(self) -> None:
        path = filedialog.askopenfilename(
            title="打开 JSON 文件",
            filetypes=[("JSON 文件", "*.json"), ("所有文件", "*.*")],
            initialdir=os.path.dirname(self.path),
        )
        if not path:
            return
        self.path = path
        for w in self.form_frame.winfo_children():
            w.destroy()
        self.field_vars.clear()
        self.field_originals.clear()
        self.current_idx = -1
        self.lbl_title.config(text="（请从左侧选择记录）")
        self._load_data()

    # ── 工具方法 ───────────────────────────────────────────────────────────────

    def _set_statusbar(self, msg: str) -> None:
        self.statusbar.config(text=f"  {msg}")


# ── 入口 ───────────────────────────────────────────────────────────────────────

def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    path = os.path.abspath(path)
    app = ReviewApp(path)
    app.mainloop()


if __name__ == "__main__":
    main()
