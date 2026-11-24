import { useEffect, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';

type Node = { id: number; name: string; leaf: boolean };
type Detail = { id: number; path: string; names: string[]; leaf: boolean };

/**
 * 类目选择：像省市区那样一级一级点下去，只列当前父级下的子类目。
 * 数据来自商家后台（只含本店可发布的类目），所以不会选到别家店没资格的类目。
 */
export function CategoryField({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="link-button category-open" onClick={() => setOpen(true)}>
        从后台选择类目
      </button>
      {open ? (
        <CategoryPicker
          value={value}
          onClose={() => setOpen(false)}
          onPick={(path) => {
            onChange(path);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function CategoryPicker({
  value,
  onClose,
  onPick,
}: {
  value: string;
  onClose: () => void;
  onPick: (path: string) => void;
}) {
  const [levels, setLevels] = useState<Node[][]>([]);
  const [chosen, setChosen] = useState<Node[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = async (index: number, parentId?: number) => {
    setBusy(parentId ? '读取子类目…' : '读取一级类目…');
    setError('');
    try {
      const rows = (await window.desktop.categories(
        parentId ? { kind: 'children', id: parentId } : { kind: 'roots' },
      )) as Node[] | undefined;
      const next = (rows || []).filter((row) => Number.isInteger(row.id) && row.name);
      setLevels((old) => [...old.slice(0, index), next]);
      setChosen((old) => old.slice(0, index));
      setDetail(null);
      if (!next.length) setError('这个类目下面没有可选子类目');
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''));
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    void load(0);
    // 只在打开时拉一次根类目
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = async (node: Node, index: number) => {
    setChosen((old) => [...old.slice(0, index), node]);
    setDetail(null);
    if (node.leaf) {
      setBusy('确认类目…');
      try {
        const found = (await window.desktop.categories({ kind: 'detail', id: node.id })) as
          | Detail
          | undefined;
        setDetail(found || null);
        setLevels((old) => old.slice(0, index + 1));
      } finally {
        setBusy('');
      }
      return;
    }
    await load(index + 1, node.id);
  };

  return (
    <div className="category-overlay" role="dialog" aria-modal="true" aria-label="选择类目">
      <div className="category-dialog">
        <header>
          <div>
            <h3>选择类目</h3>
            <p className="quiet-note">
              只列出本店可发布的类目；末级才能选中。当前：{value || '未填写'}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </header>
        <div className="category-levels">
          {levels.map((nodes, index) => (
            <label key={index} className="category-level">
              <span>第 {index + 1} 级</span>
              <select
                value={chosen[index]?.id ?? ''}
                onChange={(e) => {
                  const node = nodes.find((item) => item.id === Number(e.target.value));
                  if (node) void choose(node, index);
                }}
              >
                <option value="">{index ? '请选择' : '请选择大类'}</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                    {node.leaf ? '' : ' ›'}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="category-picked">
          {detail ? (
            <>
              <Check size={16} />
              <span>{detail.path}</span>
              <code>cat_id {detail.id}</code>
            </>
          ) : (
            <span className="quiet-note">
              {busy || (chosen.length ? '这个类目还有下一级，请继续选择' : '先选大类，再逐级往下')}
            </span>
          )}
        </div>
        {error ? <p className="error-message">{error}</p> : null}
        <footer>
          <button className="button" onClick={onClose}>
            取消
          </button>
          <button
            className="button primary"
            disabled={!detail}
            onClick={() => detail && onPick(detail.path)}
          >
            使用这个类目
            <ChevronRight size={16} />
          </button>
        </footer>
      </div>
    </div>
  );
}
