import { useState, useEffect, useMemo } from 'react';
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
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { RequestHistory as RequestHistoryType, Header, Environment } from '../types';
import { getHistory, deleteHistory, clearHistory } from '../api/history';
import {
  inspectHistoryEnvironment,
  ENV_CHANGE_LABELS,
  ENV_STATUS_LABELS,
  EnvVariableChange,
  HistoryEnvState,
} from '../utils/environment';

const { Text } = Typography;

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
  activeEnvironment: Environment | null;
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

const STATUS_TAG_COLORS = {
  matching: 'green',
  changed: 'orange',
  missing: 'red',
  switched: 'orange',
} as const;

const WARNING_TAG_COLORS = {
  changed: 'warning',
  missing: 'error',
  switched: 'warning',
} as const;

const formatValue = (value: string): string => (value === '' ? '（空）' : value);

const ChangeTooltip = ({
  status,
  changes,
}: {
  status: 'changed' | 'missing' | 'switched';
  changes: EnvVariableChange[];
}) => (
  <div style={{ maxWidth: 360 }}>
    <div style={{ marginBottom: changes.length > 0 ? 6 : 0 }}>
      <Text style={{ color: '#fff' }}>{ENV_STATUS_LABELS[status]}</Text>
    </div>
    {changes.map((change) => (
      <div key={change.key} style={{ marginBottom: 4 }}>
        <Text style={{ color: '#fff' }} strong>
          {`{{${change.key}}}`}
        </Text>
        <Tag
          color={change.type === 'changed' ? 'orange' : change.type === 'added' ? 'blue' : 'red'}
          style={{ marginInline: 8 }}
        >
          {ENV_CHANGE_LABELS[change.type]}
        </Tag>
        {change.type === 'changed' && (
          <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            {formatValue(change.snapshotValue)} → {formatValue(change.currentValue)}
          </Text>
        )}
        {change.type === 'added' && (
          <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            当前值: {formatValue(change.currentValue)}
          </Text>
        )}
        {change.type === 'removed' && (
          <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            快照值: {formatValue(change.snapshotValue)}
          </Text>
        )}
      </div>
    ))}
  </div>
);

const HistoryModal = ({ visible, onClose, activeEnvironment, onRestore }: HistoryModalProps) => {
  const [history, setHistory] = useState<RequestHistoryType[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  // 环境快照与当前环境不一致、等待用户明确确认的历史项
  const [pendingItem, setPendingItem] = useState<RequestHistoryType | null>(null);

  useEffect(() => {
    if (visible) {
      fetchHistory();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setPendingItem(null);
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

  /** 实际执行恢复：始终回填发送时的原始 URL 模板 */
  const applyRestore = (item: RequestHistoryType, useResolvedUrl: boolean) => {
    onRestore({
      method: item.method,
      url: useResolvedUrl || !item.urlTemplate ? item.url : item.urlTemplate,
      headers: item.headers,
      body: item.body,
    });
    setPendingItem(null);
    onClose();
    if (useResolvedUrl && item.urlTemplate) {
      message.warning('已按历史中的实际解析地址恢复，未回填原始模板');
    } else if (item.urlTemplate) {
      message.success('已恢复请求配置（含原始 URL 模板）');
    } else {
      message.success('已恢复请求配置');
    }
  };

  const handleRestoreClick = (item: RequestHistoryType) => {
    const state = inspectHistoryEnvironment(item, activeEnvironment);
    // 未使用环境或环境变量与快照完全一致：维持原有恢复流程
    if (state.status === 'none' || state.status === 'matching') {
      applyRestore(item, false);
      return;
    }
    // 快照与当前环境不一致：先明确提示，不得静默套用新值
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

  const envStateMap = useMemo(() => {
    const map = new Map<string, HistoryEnvState>();
    history.forEach((item) => {
      map.set(item._id, inspectHistoryEnvironment(item, activeEnvironment));
    });
    return map;
  }, [history, activeEnvironment]);

  const filteredHistory = history.filter((item) => {
    if (!searchText) return true;
    const keyword = searchText.toLowerCase();
    return (
      item.method.toLowerCase().includes(keyword) ||
      item.url.toLowerCase().includes(keyword) ||
      (item.urlTemplate || '').toLowerCase().includes(keyword) ||
      (item.environmentName || '').toLowerCase().includes(keyword)
    );
  });

  const pendingState = pendingItem
    ? inspectHistoryEnvironment(pendingItem, activeEnvironment)
    : null;

  const pendingHasTemplate = !!pendingItem?.urlTemplate && pendingItem.urlTemplate !== pendingItem.url;

  const renderWarningModal = () => {
    if (!pendingItem || !pendingState) return null;

    const snapshotEnvName = pendingItem.environmentName || '';
    const currentEnvName = activeEnvironment ? activeEnvironment.name : '（未选择环境）';

    return (
      <Modal
        open
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
            <span>环境变量与历史快照不一致</span>
          </Space>
        }
        onCancel={() => setPendingItem(null)}
        width={640}
        footer={
          <Space>
            <Button onClick={() => setPendingItem(null)}>取消</Button>
            {pendingHasTemplate ? (
              <>
                <Button onClick={() => applyRestore(pendingItem, true)}>
                  使用历史解析地址恢复
                </Button>
                <Button type="primary" danger onClick={() => applyRestore(pendingItem, false)}>
                  仍恢复原始模板
                </Button>
              </>
            ) : (
              <Button type="primary" onClick={() => applyRestore(pendingItem, true)}>
                按历史地址恢复
              </Button>
            )}
          </Space>
        }
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="恢复将回填发送时的原始 URL 模板，再次发送时会按当前环境变量重新解析。"
        />

        {pendingState.status === 'switched' && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={`发送时使用环境「${snapshotEnvName}」，当前激活环境为「${currentEnvName}」。`}
          />
        )}
        {pendingState.status === 'missing' && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message={`发送时使用的环境「${snapshotEnvName}」已被删除，当前为「${currentEnvName}」。`}
          />
        )}

        <div style={{ marginBottom: 8 }}>
          <Text strong>原始 URL 模板：</Text>
          <Text code>{pendingItem.urlTemplate || '（无模板，发送时未使用环境变量）'}</Text>
        </div>
        <div style={{ marginBottom: 12 }}>
          <Text strong>历史解析地址：</Text>
          <Text code>{pendingItem.url}</Text>
        </div>

        {pendingState.changes.length > 0 && (
          <>
            <Text strong>变化的变量：</Text>
            <List
              size="small"
              bordered
              dataSource={pendingState.changes}
              style={{ marginTop: 8 }}
              renderItem={(change) => (
                <List.Item>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <Text code>{`{{${change.key}}}`}</Text>
                      <Tag
                        color={
                          change.type === 'changed'
                            ? 'orange'
                            : change.type === 'added'
                            ? 'blue'
                            : 'red'
                        }
                      >
                        {ENV_CHANGE_LABELS[change.type]}
                      </Tag>
                    </Space>
                    <Space>
                      <Text type="secondary">快照值: {formatValue(change.snapshotValue)}</Text>
                      <Text type="secondary">当前值: {formatValue(change.currentValue)}</Text>
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>
    );
  };

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
            placeholder="搜索方法、URL 模板、实际解析地址或环境名..."
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
                const envState = envStateMap.get(item._id);
                const warningStatus: 'changed' | 'missing' | 'switched' | null =
                  envState &&
                  envState.hasSnapshot &&
                  (envState.status === 'changed' ||
                    envState.status === 'missing' ||
                    envState.status === 'switched')
                    ? envState.status
                    : null;

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
                        <Space wrap size={8}>
                          <Tag color={methodColors[item.method] || 'default'}>{item.method}</Tag>
                          <Text code>{item.urlTemplate || item.url}</Text>
                          {warningStatus && (
                            <Tooltip
                              title={
                                <ChangeTooltip
                                  status={warningStatus}
                                  changes={envState?.changes || []}
                                />
                              }
                              color="#5c5c5c"
                            >
                              <Tag
                                icon={<ExclamationCircleOutlined />}
                                color={WARNING_TAG_COLORS[warningStatus]}
                              >
                                {ENV_STATUS_LABELS[warningStatus]}
                              </Tag>
                            </Tooltip>
                          )}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={2}>
                          <Space wrap size={8}>
                            <Text type="secondary">
                              {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                            </Text>
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
                            {item.environmentName && envState && (
                              <Tag
                                color={
                                  envState.status === 'matching'
                                    ? STATUS_TAG_COLORS.matching
                                    : envState.status === 'missing'
                                    ? STATUS_TAG_COLORS.missing
                                    : STATUS_TAG_COLORS.changed
                                }
                              >
                                环境: {item.environmentName}
                              </Tag>
                            )}
                          </Space>
                          {item.urlTemplate && item.urlTemplate !== item.url && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              实际请求: {item.url}
                            </Text>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </Modal>

      {renderWarningModal()}
    </>
  );
};

export default HistoryModal;
