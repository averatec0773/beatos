/**
 * Search keywords for the Settings search box, keyed by section entry id. These
 * are match terms (data), not rendered UI — deliberately bilingual (EN + 中文) so
 * the search works in either language. Kept out of `routes/`/`components/` so the
 * no-hardcoded-cjk guard (which forces UI strings through i18n) doesn't flag the
 * Chinese match terms. The visible section headings still render via t(...).
 */
export const SETTINGS_SEARCH_KEYWORDS: Record<string, string> = {
  appearance: "appearance theme backdrop aurora ascii panel opacity 外观 主题 背景 极光 透明度 面板",
  language: "language app interface 语言 界面",
  tagDisplay: "tag display genre mood vocab locale english chinese 标签 显示 曲风 情绪 中英",
  uploadTemplates: "upload templates album beat name caption 上传 模板 专辑 命名 文案",
  licenseTiers: "license tiers default price mp3 wav stem 授权 层级 默认 价格",
  producers: "producers credits collaborators 制作人 合作",
  aiAssist:
    "ai assist provider api key model openai chatgpt deepseek claude anthropic 模型 密钥 服务商",
  agentPermissions: "agent permission read only write 代理 权限 只读 写入",
  aiIntegration: "mcp integration claude desktop connect 集成 接入",
  storage: "storage database db path location folder 存储 数据库 路径 位置",
  about: "about version credits website repo github 关于 版本 网站",
};
