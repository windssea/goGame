import { useRegisterSW } from "virtual:pwa-register/react";
import { ArrowsClockwise } from "@phosphor-icons/react";
export function OfflineUpdate({ busy }: { busy: boolean }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="toast update-notice" role="status">
      <ArrowsClockwise size={20} />
      <span>
        {busy
          ? "新版本已准备，请在课程或对局结束后更新。"
          : "新版本已准备，记录已在本机保存。"}
      </span>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => void updateServiceWorker(true)}
      >
        更新
      </button>
    </div>
  );
}
