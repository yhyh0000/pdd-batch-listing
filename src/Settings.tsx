import { RefreshCw } from 'lucide-react';
import type { BrowserConnectionStatus, UpdateState } from './types';

const BROWSER_TEXT: Record<BrowserConnectionStatus['state'], string> = {
  ready: '已连接，可以开始执行任务',
  extension_disconnected: '浏览器插件没有连上，按「连接教程」装一次',
  service_unavailable: '本机的桥接服务没起来，点「重新检测」',
  version_mismatch: '插件与本机服务版本不一致，按「连接教程」升级',
  unsupported: '当前的浏览器不受支持，请用 Chrome 或 Edge',
};

type Props = {
  browserStatus: BrowserConnectionStatus | null;
  checkingBrowser: boolean;
  version: string;
  updateState: UpdateState | null;
  encryptionAvailable: boolean;
  onCheckBrowser: () => void;
  onBrowserSetup: () => void;
  onAgentSettings: () => void;
  onUpdates: () => void;
  onDataFolder: () => void;
};

type RowProps = {
  name: string;
  hint?: string;
  children: React.ReactNode;
};

function Row({ name, hint, children }: RowProps) {
  return (
    <div className="setting-row">
      <div className="setting-name">
        {name}
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className="setting-value">{children}</div>
    </div>
  );
}

export function Settings({
  browserStatus,
  checkingBrowser,
  version,
  updateState,
  encryptionAvailable,
  onCheckBrowser,
  onBrowserSetup,
  onAgentSettings,
  onUpdates,
  onDataFolder,
}: Props) {
  const state = browserStatus?.state;
  const ready = state === 'ready';
  const browserText = checkingBrowser
    ? '正在检测…'
    : !browserStatus
      ? '还没检测过浏览器连接'
      : BROWSER_TEXT[state!];
  const updateText =
    updateState?.status === 'available' && updateState.release
      ? `发现新版本 ${updateState.release.version}`
      : updateState?.status === 'downloading'
        ? `正在下载 ${Math.round(updateState.received / 1024 / 1024)} MB`
        : updateState?.status === 'ready'
          ? '新版本已下载，可以安装'
          : updateState?.status === 'error'
            ? '检查更新失败，重试一次或直接下载安装包'
            : '当前已是最新版';

  return (
    <section className="settings" aria-label="设置">
      <div className="section-head">
        <div>
          <h2>设置</h2>
          <p>浏览器连接、模型、资料目录与版本，都在这一页。</p>
        </div>
      </div>

      <div className="setting-group">
        <h3>浏览器连接</h3>
        <Row name="连接状态" hint="执行任务前要先连上浏览器">
          <span className={`breath ${ready ? 'on' : state ? 'warn' : 'off'}`} aria-hidden="true" />
          <span className={ready ? '' : 'quiet-note'}>{browserText}</span>
        </Row>
        <Row name="本机服务 · 插件" hint="两者版本要一致">
          <span className="quiet-note">
            {browserStatus?.serviceVersion || '未知'}
            <span className="sep">·</span>
            {browserStatus?.extensionVersion || '未知'}
          </span>
        </Row>
        <Row name="连接操作">
          <button
            className="button"
            onClick={onCheckBrowser}
            disabled={checkingBrowser}
            type="button"
          >
            <RefreshCw size={14} aria-hidden="true" />
            {checkingBrowser ? '检测中…' : '重新检测'}
          </button>
          <button className="button" onClick={onBrowserSetup} type="button">
            连接教程
          </button>
        </Row>
      </div>

      <div className="setting-group">
        <h3>执行</h3>
        <Row name="Agent 模型" hint="看页面、点按钮、读回字段">
          <button className="button" onClick={onAgentSettings} type="button">
            打开模型设置
          </button>
        </Row>
      </div>

      <div className="setting-group">
        <h3>本机资料</h3>
        <Row name="资料目录" hint="资料都在这台电脑上">
          <button className="button" onClick={onDataFolder} type="button">
            打开目录
          </button>
        </Row>
        <Row name="登录密码">
          <span className="quiet-note">
            {encryptionAvailable ? '已用系统钥匙串加密保存' : '当前系统不支持加密，密码不保存'}
          </span>
        </Row>
      </div>

      <div className="setting-group">
        <h3>软件更新</h3>
        <Row name="更新状态">
          <span className={updateState?.status === 'available' ? '' : 'quiet-note'}>
            {updateText}
          </span>
          <button className="button" onClick={onUpdates} type="button">
            查看版本与更新
          </button>
        </Row>
        <Row name="当前版本">
          <span className="quiet-note">{version || '未知'}</span>
        </Row>
      </div>

      <div className="setting-group">
        <h3>关于</h3>
        <Row name="程序" hint="本机运行，资料不出电脑">
          <span className="quiet-note">商品运营台 {version || ''}</span>
        </Row>
        <Row name="源码许可">
          <span className="quiet-note">PolyForm Noncommercial 1.0.0（非商业使用）</span>
        </Row>
      </div>
    </section>
  );
}
