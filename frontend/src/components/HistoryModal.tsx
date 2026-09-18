import { useState, useEffect } from 'react';
import {
  Modal,
  Input,
  List,
  Tag,
  Button,
  message,
  Space,
  Typography,
  Empty,
  Popconfirm,
  Tooltip,
  Alert,
} from 'antd';
import {
  SearchOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ClearOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  RequestHistory as RequestHistoryType,
  Header,
  Environment,
  ChangedVariable,
} from '../types';
import { getHistory, deleteHistory, clearHistory } from '../api/history';

const { Text, Paragraph } = Typography;

interface HistoryModalProps {
  visible: boolean;
  activeEnvironment: Environment | null;
  onClose: () => void;
  onRestore: (config: {
    method: RequestHistoryType['method'];
    url: string;
    headers: Header[];
    body?: string;
  }) => void;
}

const methodColors: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
  HEAD: 'cyan',
  OPTIONS: 'magenta',
};

const isValuePresent = (value: string | null): value is string => value !== null;

// 格式化单个变量的旧值 / 当前值
const formatValue = (value: string | null): string =>
  isValuePresent(value) ? value : '（变量已不存在）';

const HistoryModal = ({ visible, activeEnvironment, onClose, onRestore }: HistoryModalProps) => {
  const [history, setHistory] = useState<RequestHistoryType[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  // 待确认恢复的历史项（环境变量与快照不一致时弹警告）
  const [pendingItem, setPendingItem] = useState<RequestHistoryType | null>(null);

  useEffect(() => {
    if (visible) {
      fetchHistory();
    }
  }, [visible]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const data = await getHistory({ limit: 100 });
      setHistory(data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  // 恢复请求配置：变量一致走原流程；不一致先明确提示，绝不静默套用新值
  const doRestore = (item: RequestHistoryType, useTemplate: boolean) => {
    onRestore({
      method: item.method,
      url: useTemplate && item.urlTemplate ? item.urlTemplate : item.url,
      headers: item.headers,
      body: item.body,
    });
    setPendingItem(null);
    onClose();
    message.success('已恢复请求配置');
  };

  const handleRestoreClick = (item: RequestHistoryType) => {
    const hasSnapshot = !!item.envSnapshot && !!item.urlTemplate;
    const changed = item.changedVariables || [];
    const envDeleted = item.envStatus === 'deleted';

    // 旧历史或未使用环境：维持原恢复流程
    if (!hasSnapshot) {
      doRestore(item, false);
      return;
    }

    // 变量与快照一致：维持原恢复流程，回填原始模板
    if (!envDeleted && changed.length === 0) {
      doRestore(item, true);
      return;
    }

    // 不一致：先提示，不恢复、不套用当前值
    setPendingItem(item);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteHistory(id);
      message.success('删除成功');
      fetchHistory();
    } catch {
    }
  };

  const handleClear = async () => {
    try {
      await clearHistory();
      message.success('清空成功');
      fetchHistory();
    } catch {
    }
  };

  const filteredHistory = history.filter((item) => {
    if (!searchText) return true;
    const keyword = searchText.toLowerCase();
    return (
      item.method.toLowerCase().includes(keyword) ||
      // 搜索可命中原始模板
      (item.urlTemplate || '').toLowerCase().includes(keyword) ||
      // 也可命中实际解析地址
      item.url.toLowerCase().includes(keyword)
    );
  });

  const pendingChanged = pendingItem?.changedVariables || [];
  const pendingEnvDeleted = pendingItem?.envStatus === 'deleted';
  const pendingDifferentActive =
    pendingItem?.envSnapshot &&
    activeEnvironment &&
    pendingItem.envSnapshot.environmentId !== activeEnvironment._id;

  const renderChangedTooltip = (changed: ChangedVariable[]) => (
    <div>
      <div style={{ marginBottom: 4 }}>环境变量相较快照已变化：</div>
      {changed.map((variable) => (
        <div key={variable.key} style={{ lineHeight: '20px' }}>
          <Text style={{ color: '#ffd591' }}>{variable.key}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)' }}>
            {' '}
            旧值「{formatValue(variable.snapshotValue)}」→ 当前「{formatValue(variable.currentValue)}」
          </Text>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Modal
        title="请求历史"
        open={visible}
        onCancel={onClose}
        width={800}
        footer={
          <Space>
            <Popconfirm
              title="确认清空所有历史记录？"
              onConfirm={handleClear}
              okText="确认"
              cancelText="取消"
            >
              <Button danger icon={<ClearOutlined />}>
                清空历史
              </Button>
            </Popconfirm>
            <Button onClick={onClose}>关闭</Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索请求（可命中 URL 模板或解析地址）..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </div>

        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          {filteredHistory.length === 0 ? (
            <Empty description="暂无请求历史" />
          ) : (
            <List
              loading={loading}
              dataSource={filteredHistory}
              renderItem={(item) => {
                const hasSnapshot = !!item.envSnapshot && !!item.urlTemplate;
                const resolvedDiffers = !!item.urlTemplate && item.urlTemplate !== item.url;
                const changed = item.changedVariables || [];
                const envDeleted = item.envStatus === 'deleted';
                const hasMismatch = hasSnapshot && (envDeleted || changed.length > 0);

                return (
                  <List.Item
                    actions={[
                      <Button
                        key="restore"
                        type="link"
                        icon={<ReloadOutlined />}
                        onClick={() => handleRestoreClick(item)}
                      >
                        恢复
                      </Button>,
                      <Popconfirm
                        key="delete"
                        title="确认删除？"
                        onConfirm={() => handleDelete(item._id)}
                        okText="确认"
                        cancelText="取消"
                      >
                        <Button type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space size={8} wrap>
                          <Tag color={methodColors[item.method] || 'default'}>{item.method}</Tag>
                          <Text code>{item.urlTemplate || item.url}</Text>
                        </Space>
                      }
                      description={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {/* 实际解析地址（仅在与模板不同、确实发生变量替换时展示） */}
                          {hasSnapshot && resolvedDiffers && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              解析地址：{item.url}
                            </Text>
                          )}
                          <Space size={8} wrap>
                            <Text type="secondary">
                              {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                            </Text>
                            {hasSnapshot && (
                              <Tag color={envDeleted ? 'red' : 'blue'}>
                                {item.envSnapshot?.name}
                                {envDeleted ? '（环境已删除）' : ''}
                              </Tag>
                            )}
                            {hasMismatch && !envDeleted && changed.length > 0 && (
                              <Tooltip title={renderChangedTooltip(changed)}>
                                <Tag icon={<WarningOutlined />} color="orange">
                                  {changed.length} 个变量已变化
                                </Tag>
                              </Tooltip>
                            )}
                            {item.response && (
                              <Tag
                                color={
                                  item.response.status >= 200 && item.response.status < 300
                                    ? 'green'
                                    : item.response.status >= 400
                                    ? 'red'
                                    : 'orange'
                                }
                              >
                                {item.response.status} {item.response.statusText}
                              </Tag>
                            )}
                            {item.response && (
                              <Text type="secondary">{item.response.duration}ms</Text>
                            )}
                          </Space>
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </Modal>

      {/* 恢复前变量不一致警告：不静默套用当前值，由用户显式选择 */}
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            <span>环境变量与发送时快照不一致</span>
          </Space>
        }
        open={!!pendingItem}
        onCancel={() => setPendingItem(null)}
        footer={
          <Space>
            <Button onClick={() => setPendingItem(null)}>取消</Button>
            <Button type="primary" onClick={() => pendingItem && doRestore(pendingItem, false)}>
              用旧解析地址恢复
            </Button>
            <Button
              onClick={() => pendingItem && doRestore(pendingItem, true)}
            >
              仍恢复原始模板
            </Button>
          </Space>
        }
      >
        {pendingItem && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {pendingEnvDeleted && (
              <Alert
                type="error"
                message={`发送时的环境「${pendingItem.envSnapshot?.name}」已被删除，无法解析原始模板。`}
                showIcon
              />
            )}
            {!pendingEnvDeleted && pendingDifferentActive && (
              <Alert
                type="warning"
                message={`当前激活环境为「${activeEnvironment?.name}」，与发送时的环境「${pendingItem.envSnapshot?.name}」不同。`}
                showIcon
              />
            )}
            {pendingEnvDeleted ? (
              <Paragraph style={{ marginBottom: 0 }} type="secondary">
                环境已删除，模板中的变量无法再按原环境解析。可使用发送时的旧解析地址恢复，或回填原始模板稍后手动处理。
              </Paragraph>
            ) : (
              <>
                <Paragraph style={{ marginBottom: 0 }}>
                  该请求发送时使用的环境为「
                  <Text strong>{pendingItem.envSnapshot?.name}</Text>
                  」，以下变量与快照不一致：
                </Paragraph>
                <List
                  size="small"
                  bordered
                  dataSource={pendingChanged}
                  locale={{ emptyText: <Text type="secondary">模板未引用已变化的变量</Text> }}
                  renderItem={(variable) => (
                    <List.Item>
                      <Space direction="vertical" size={0} style={{ width: '100%' }}>
                        <Text strong>{variable.key}</Text>
                        <Text type="secondary">
                          快照值：{formatValue(variable.snapshotValue)}
                        </Text>
                        <Text type="warning">当前值：{formatValue(variable.currentValue)}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </>
            )}
            <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
              直接恢复模板会用当前变量值重新解析；若希望保持发送时的实际地址，请选择「用旧解析地址恢复」。
            </Paragraph>
          </Space>
        )}
      </Modal>
    </>
  );
};

export default HistoryModal;
