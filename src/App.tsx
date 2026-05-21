import { useEffect, useRef, useState } from 'react';
import { Moon, Settings, Sun, Wifi, WifiOff } from 'lucide-react';
import { useThemeStore } from './stores/theme';
import { useApiKeysStore } from './stores/apiKeys';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import ApiSettingsModal from './components/ApiSettings';
import * as api from './services/api';
import type { NodeType } from './types/canvas';

/**
 * T8-penguin-canvas 应用根组件 (Phase 1)
 * 布局: [侧边栏(画布管理 + 节点列表)] [画布主体] + 头部状态栏
 */
function App() {
  const { theme, toggleTheme } = useThemeStore();
  const { load: loadSettings } = useApiKeysStore();
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 画布接收节点添加的 ref(从 Sidebar -> Canvas)
  const addNodeRef = useRef<((type: NodeType) => void) | null>(null);

  // 启动探测后端
  useEffect(() => {
    const check = async () => {
      const ok = await api.checkBackendStatus();
      setBackendStatus(ok ? 'ok' : 'error');
    };
    check();
    const t = window.setInterval(check, 15_000);
    return () => window.clearInterval(t);
  }, []);

  // 预加载 settings
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const isDark = theme === 'dark';

  const handleAddNode = (type: NodeType) => {
    addNodeRef.current?.(type);
  };

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden ${
        isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
      }`}
    >
      {/* 头部状态栏 */}
      <header
        className={`flex items-center justify-between px-4 py-2 border-b ${
          isDark ? 'bg-zinc-900 border-white/10' : 'bg-white border-black/10'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🐧</span>
          <h1 className="text-sm font-semibold">T8 企鹅画布</h1>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            isDark ? 'bg-white/10 text-white/60' : 'bg-black/5 text-zinc-500'
          }`}>
            v1.0.0
          </span>
          {/* 后端状态 */}
          <div className={`flex items-center gap-1.5 text-[11px] ${
            backendStatus === 'ok'
              ? 'text-emerald-400'
              : backendStatus === 'error'
                ? 'text-red-400'
                : 'text-yellow-400'
          }`}>
            {backendStatus === 'ok' ? <Wifi size={12} /> : <WifiOff size={12} />}
            {backendStatus === 'ok' && '后端已连接'}
            {backendStatus === 'error' && '后端未连接'}
            {backendStatus === 'checking' && '检测中...'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSettingsOpen(true)}
            className={`p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
            title="API 设置"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
            title={`切换到${isDark ? '浅色' : '深色'}主题`}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* 主体两栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar onAddNode={handleAddNode} />
        <Canvas onAddNodeRef={addNodeRef} />
      </div>

      {/* API 设置弹窗 */}
      <ApiSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App;
