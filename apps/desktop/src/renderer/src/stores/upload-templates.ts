import { create } from "zustand";

import { appSettings } from "@/api/app-settings";

const KEY = "upload_templates";

export interface UploadTemplates {
  album_name: string;
  beat_name: string;
  beat_description: string;
  album_description: string;
  prod: string;
  prod_separator: string;
}

export const DEFAULT_TEMPLATES: UploadTemplates = {
  album_name: "{year} {title}",
  beat_name: '[FREE] "{title}" - {genre} TYPE BEAT',
  beat_description:
    "Prod.{prod}\n评论+关注+歌名后缀获取非商用使用权\n" +
    "!非商用使用权仅允许本平台发歌，上传歌曲需要绑定25%播放收益分成!\n" +
    "不允许: 发布其他音乐或短视频平台，以及拍摄MV, 演出等盈利行为\n" +
    "如需完整使用权请进行购买，感谢支持！",
  album_description: "{publish date} Prod.{prod}",
  prod: "Averatec x Redketch",
  prod_separator: " x ",
};

interface State {
  templates: UploadTemplates;
  hydrate(): Promise<void>;
  setField(key: keyof UploadTemplates, value: string): Promise<void>;
  reset(): Promise<void>;
}

export const useUploadTemplatesStore = create<State>((set, get) => ({
  templates: { ...DEFAULT_TEMPLATES },
  async hydrate() {
    try {
      const r = await appSettings.get<Partial<UploadTemplates>>(KEY);
      if (r.value && typeof r.value === "object") {
        set({ templates: { ...DEFAULT_TEMPLATES, ...r.value } });
      }
    } catch (e) {
      console.warn("[upload-templates] hydrate failed", e);
    }
  },
  async setField(key, value) {
    const next = { ...get().templates, [key]: value };
    set({ templates: next }); // optimistic
    try {
      await appSettings.set<UploadTemplates>(KEY, next);
    } catch (e) {
      console.error("[upload-templates] persist failed", e);
    }
  },
  async reset() {
    set({ templates: { ...DEFAULT_TEMPLATES } });
    try {
      await appSettings.set<UploadTemplates>(KEY, DEFAULT_TEMPLATES);
    } catch (e) {
      console.error("[upload-templates] reset failed", e);
    }
  },
}));
