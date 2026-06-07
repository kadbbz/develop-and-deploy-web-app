import {
  CalculatorOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FilterOutlined,
  LoginOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserAddOutlined
} from "@ant-design/icons";
import { PageContainer, ProCard } from "@ant-design/pro-components";
import {
  Button,
  ConfigProvider,
  Form,
  Input,
  InputNumber,
  Layout,
  message,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import * as echarts from "echarts";
import { useEffect, useMemo, useRef, useState } from "react";

const themeConfig = {
  token: {
    colorPrimary: "#2563eb",
    colorInfo: "#0891b2",
    colorSuccess: "#16a34a",
    colorWarning: "#d97706",
    colorError: "#dc2626",
    borderRadius: 6,
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  components: {
    Button: {
      controlHeight: 36,
      borderRadius: 6
    },
    Table: {
      headerBg: "#f8fafc",
      rowHoverBg: "#f4f7fb"
    },
    Tabs: {
      itemSelectedColor: "#1d4ed8"
    }
  }
};

type AppUser = {
  username: string;
  displayName: string;
  roles: string[];
};

type Session = {
  authenticated: boolean;
  sessionToken?: string;
  user: AppUser;
};

type RecordItem = {
  id: string;
  ownerUsername: string;
  title: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  payload: Record<string, unknown>;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
};

type StatsPayload = {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
};

type RuleLevel = "high" | "medium" | "normal";

type RuleResult = {
  ruleLevel: RuleLevel;
  ruleLabel: string;
  amountBand: string;
  followUpDays: number;
  reviewRequired: boolean;
  suggestedAction: string;
};

type VisitFormValues = {
  customerName: string;
  contactName?: string;
  visitDate?: string;
  visitType?: string;
  opportunityAmount?: number;
  summary?: string;
  nextAction?: string;
};

type RecordFilters = {
  keyword: string;
  status: string;
  visitType: string;
  ruleLevel: string;
};

const apiBase = "/__TOKEN__/api";
const sessionKey = "liteapp:session:__TOKEN__";

function sessionHeaders() {
  const sessionToken = window.localStorage.getItem(sessionKey);
  return sessionToken ? { "x-liteapp-session": sessionToken } : {};
}

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  for (const [key, value] of Object.entries(sessionHeaders())) {
    headers.set(key, value);
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "请求失败");
  }
  return payload as T;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    submitted: "已提交",
    approved: "已通过",
    rejected: "已驳回"
  };
  return labels[status] || status;
}

function visitTypeLabel(value: string) {
  const labels: Record<string, string> = {
    "first-visit": "初次拜访",
    "follow-up": "跟进沟通",
    contract: "合同洽谈",
    support: "售后支持"
  };
  return labels[value] || value;
}

function evaluateBusinessRules(values: Partial<VisitFormValues> | Record<string, unknown>): RuleResult {
  const amount = Number(values.opportunityAmount || 0);
  const visitType = String(values.visitType || "first-visit");
  const summary = String(values.summary || "");
  const reviewRequired = amount >= 100000 || /合同|报价|权限|审计|风险|审批/.test(summary);

  if (amount >= 150000 || visitType === "contract") {
    return {
      ruleLevel: "high",
      ruleLabel: "高优先级",
      amountBand: "重点机会",
      followUpDays: 1,
      reviewRequired: true,
      suggestedAction: "1 个工作日内推进，并同步负责人"
    };
  }

  if (amount >= 50000 || visitType === "follow-up" || reviewRequired) {
    return {
      ruleLevel: "medium",
      ruleLabel: "需要跟进",
      amountBand: amount >= 50000 ? "常规机会" : "小额机会",
      followUpDays: 3,
      reviewRequired,
      suggestedAction: "3 个工作日内补齐信息并更新进展"
    };
  }

  return {
    ruleLevel: "normal",
    ruleLabel: "常规跟进",
    amountBand: "小额机会",
    followUpDays: 7,
    reviewRequired: false,
    suggestedAction: "7 个工作日内完成下一步动作"
  };
}

function ruleLevelMeta(value: unknown) {
  const level = String(value || "normal");
  const meta: Record<string, { label: string; color: string }> = {
    high: { label: "高优先级", color: "red" },
    medium: { label: "需要跟进", color: "gold" },
    normal: { label: "常规跟进", color: "green" }
  };
  return meta[level] || meta.normal;
}

function formatAmount(value: unknown) {
  return Number(value || 0).toLocaleString();
}

function StatusChart({ stats }: { stats: StatsPayload | null }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const chart = echarts.init(ref.current);
    chart.setOption({
      color: ["#1677ff", "#13c2c2", "#52c41a", "#faad14"],
      tooltip: { trigger: "axis" },
      grid: { top: 24, right: 18, bottom: 32, left: 36 },
      xAxis: {
        type: "category",
        data: (stats?.byStatus || []).map((item) => statusLabel(item.status))
      },
      yAxis: { type: "value", minInterval: 1 },
      series: [
        {
          type: "bar",
          data: (stats?.byStatus || []).map((item) => item.count),
          barWidth: 26
        }
      ]
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [stats]);

  return <div className="status-chart" ref={ref} />;
}

export function App() {
  const [authForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [recordForm] = Form.useForm();
  const [session, setSession] = useState<Session | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [rulePreview, setRulePreview] = useState<RuleResult>(() =>
    evaluateBusinessRules({ visitType: "first-visit" })
  );
  const [recordFilters, setRecordFilters] = useState<RecordFilters>({
    keyword: "",
    status: "all",
    visitType: "all",
    ruleLevel: "all"
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const filteredRecords = useMemo(() => {
    const keyword = recordFilters.keyword.trim().toLowerCase();
    return records.filter((record) => {
      const payloadText = JSON.stringify(record.payload).toLowerCase();
      if (keyword && !payloadText.includes(keyword) && !record.title.toLowerCase().includes(keyword)) {
        return false;
      }
      if (recordFilters.status !== "all" && record.status !== recordFilters.status) {
        return false;
      }
      if (recordFilters.visitType !== "all" && String(record.payload.visitType || "") !== recordFilters.visitType) {
        return false;
      }
      if (recordFilters.ruleLevel !== "all" && String(record.payload.ruleLevel || "normal") !== recordFilters.ruleLevel) {
        return false;
      }
      return true;
    });
  }, [records, recordFilters]);
  const highPriorityCount = useMemo(
    () => records.filter((record) => String(record.payload.ruleLevel || "normal") === "high").length,
    [records]
  );

  async function restoreSession() {
    const token = window.localStorage.getItem(sessionKey);
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const restored = await apiRequest<Session>("/auth/session");
      setSession(restored);
    } catch (_error) {
      window.localStorage.removeItem(sessionKey);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspace() {
    if (!session) {
      return;
    }
    setBusy(true);
    try {
      const [recordPayload, statsPayload] = await Promise.all([
        apiRequest<{ items: RecordItem[] }>("/records?mine=true"),
        apiRequest<StatsPayload>("/stats?mine=true")
      ]);
      setRecords(recordPayload.items);
      setStats(statsPayload);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [session]);

  async function signIn(values: { username: string; password: string }) {
    setBusy(true);
    try {
      const payload = await apiRequest<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values)
      });
      if (payload.sessionToken) {
        window.localStorage.setItem(sessionKey, payload.sessionToken);
      }
      setSession(payload);
      authForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  async function register(values: { username: string; password: string; displayName?: string }) {
    setBusy(true);
    try {
      const payload = await apiRequest<Session>("/auth/register", {
        method: "POST",
        body: JSON.stringify(values)
      });
      if (payload.sessionToken) {
        window.localStorage.setItem(sessionKey, payload.sessionToken);
      }
      setSession(payload);
      registerForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "注册失败");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => null);
    window.localStorage.removeItem(sessionKey);
    setSession(null);
    setRecords([]);
    setStats(null);
  }

  async function createRecord(values: VisitFormValues) {
    setBusy(true);
    try {
      const ruleResult = evaluateBusinessRules(values);
      await apiRequest("/records", {
        method: "POST",
        body: JSON.stringify({
          title: values.customerName,
          payload: {
            customerName: values.customerName,
            contactName: values.contactName || "",
            visitDate: values.visitDate || "",
            visitType: values.visitType || "first-visit",
            opportunityAmount: values.opportunityAmount || 0,
            summary: values.summary || "",
            nextAction: values.nextAction || "",
            ...ruleResult
          }
        })
      });
      recordForm.resetFields();
      setRulePreview(evaluateBusinessRules({ visitType: "first-visit" }));
      await loadWorkspace();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(record: RecordItem, status: RecordItem["status"]) {
    setBusy(true);
    try {
      await apiRequest(`/records/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: record.title,
          status,
          payload: record.payload
        })
      });
      await loadWorkspace();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecord(record: RecordItem) {
    setBusy(true);
    try {
      await apiRequest(`/records/${record.id}`, { method: "DELETE" });
      await loadWorkspace();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  const recordColumns: ColumnsType<RecordItem> = useMemo(
    () => [
      {
        title: "客户",
        dataIndex: ["payload", "customerName"],
        render: (_, record) => String(record.payload.customerName || record.title)
      },
      {
        title: "拜访类型",
        dataIndex: ["payload", "visitType"],
        width: 140,
        render: (value) => <Tag color="cyan">{visitTypeLabel(String(value || "first-visit"))}</Tag>
      },
      {
        title: "机会金额",
        dataIndex: ["payload", "opportunityAmount"],
        width: 140,
        render: (value) => formatAmount(value)
      },
      {
        title: "规则结果",
        dataIndex: ["payload", "ruleLevel"],
        width: 130,
        render: (value) => {
          const meta = ruleLevelMeta(value);
          return <Tag color={meta.color}>{meta.label}</Tag>;
        }
      },
      {
        title: "协作状态",
        dataIndex: "status",
        width: 140,
        render: (status) => <Tag color={status === "approved" ? "green" : "blue"}>{statusLabel(status)}</Tag>
      },
      {
        title: "下一步",
        dataIndex: ["payload", "suggestedAction"],
        ellipsis: true,
        render: (value, record) => String(value || record.payload.nextAction || "-")
      },
      {
        title: "更新时间",
        dataIndex: "updatedAt",
        width: 190,
        render: (value) => new Date(String(value)).toLocaleString()
      },
      {
        title: "操作",
        width: 260,
        render: (_, record) => (
          <Space>
            <Select
              value={record.status}
              size="small"
              style={{ width: 118 }}
              onChange={(status) => updateStatus(record, status)}
              options={[
                { value: "draft", label: "草稿" },
                { value: "submitted", label: "已提交" },
                { value: "approved", label: "已通过" },
                { value: "rejected", label: "已驳回" }
              ]}
            />
            <Button
              aria-label="删除记录"
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => deleteRecord(record)}
            />
          </Space>
        )
      }
    ],
    [records]
  );

  if (loading) {
    return (
      <ConfigProvider theme={themeConfig}>
        <div className="boot">加载中</div>
      </ConfigProvider>
    );
  }

  if (!session) {
    return (
      <ConfigProvider theme={themeConfig}>
        <Layout className="auth-layout">
          <main className="auth-grid">
            <section className="auth-title">
              <Typography.Text className="eyebrow">轻应用数据工作台</Typography.Text>
              <Typography.Title>__APP_TITLE__</Typography.Title>
              <div className="auth-status-strip">
                <span>统一账号</span>
                <span>规则计算</span>
                <span>协作填报</span>
              </div>
            </section>
            <ProCard className="auth-panel">
              <Tabs
                items={[
                  {
                    key: "login",
                    label: "登录",
                    children: (
                      <Form form={authForm} layout="vertical" onFinish={signIn}>
                        <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
                          <Input autoComplete="username" size="large" />
                        </Form.Item>
                        <Form.Item name="password" label="密码" rules={[{ required: true }]}>
                          <Input.Password autoComplete="current-password" size="large" />
                        </Form.Item>
                        <Button block htmlType="submit" icon={<LoginOutlined />} loading={busy} size="large" type="primary">
                          登录
                        </Button>
                      </Form>
                    )
                  },
                  {
                    key: "register",
                    label: "注册",
                    children: (
                      <Form form={registerForm} layout="vertical" onFinish={register}>
                        <Form.Item name="displayName" label="显示名称">
                          <Input size="large" />
                        </Form.Item>
                        <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
                          <Input autoComplete="username" size="large" />
                        </Form.Item>
                        <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
                          <Input.Password autoComplete="new-password" size="large" />
                        </Form.Item>
                        <Button block htmlType="submit" icon={<UserAddOutlined />} loading={busy} size="large" type="primary">
                          创建账号
                        </Button>
                      </Form>
                    )
                  }
                ]}
              />
            </ProCard>
          </main>
        </Layout>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout className="app-layout">
        <PageContainer
          className="page"
          title="__APP_TITLE__"
          subTitle={`业务工作台 · ${session.user.displayName}`}
          extra={[
            <Button icon={<ReloadOutlined />} key="refresh" loading={busy} onClick={loadWorkspace} />,
            <Button icon={<LogoutOutlined />} key="logout" onClick={logout}>
              退出登录
            </Button>
          ]}
        >
          <div className="summary-grid">
            <ProCard className="metric-card">
              <Statistic prefix={<TeamOutlined />} title="我的填报" value={stats?.total || 0} />
            </ProCard>
            <ProCard className="metric-card">
              <Statistic prefix={<CalculatorOutlined />} suffix="高优先" title="规则计算" value={highPriorityCount} />
            </ProCard>
            <ProCard className="chart-card">
              <StatusChart stats={stats} />
            </ProCard>
          </div>

          <div className="workspace-shell">
            <div className="workspace-heading">
              <DatabaseOutlined />
              <span>业务填报</span>
            </div>
            <div className="workspace-grid">
              <ProCard className="tool-card" title="客户拜访协作填报">
                <Form
                  form={recordForm}
                  initialValues={{ visitType: "first-visit" }}
                  layout="vertical"
                  onFinish={createRecord}
                  onValuesChange={(_, values) => setRulePreview(evaluateBusinessRules(values))}
                >
                  <Form.Item name="customerName" label="客户名称" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="contactName" label="联系人">
                    <Input />
                  </Form.Item>
                  <Form.Item name="visitDate" label="拜访日期">
                    <Input type="date" />
                  </Form.Item>
                  <Form.Item name="visitType" label="拜访类型" initialValue="first-visit">
                    <Select
                      options={[
                        { value: "first-visit", label: "初次拜访" },
                        { value: "follow-up", label: "跟进沟通" },
                        { value: "contract", label: "合同洽谈" },
                        { value: "support", label: "售后支持" }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="opportunityAmount" label="机会金额">
                    <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item name="summary" label="拜访纪要">
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} />
                  </Form.Item>
                  <Form.Item name="nextAction" label="下一步动作">
                    <Input />
                  </Form.Item>
                  <div className="rule-preview">
                    <div className="rule-preview-header">
                      <span>固定规则结果</span>
                      <Tag color={ruleLevelMeta(rulePreview.ruleLevel).color}>{rulePreview.ruleLabel}</Tag>
                    </div>
                    <div className="rule-preview-grid">
                      <span>
                        跟进时限
                        <strong>{rulePreview.followUpDays} 天</strong>
                      </span>
                      <span>
                        金额分档
                        <strong>{rulePreview.amountBand}</strong>
                      </span>
                      <span>
                        负责人同步
                        <strong>{rulePreview.reviewRequired ? "需要" : "无需"}</strong>
                      </span>
                    </div>
                  </div>
                  <Button htmlType="submit" icon={<PlusOutlined />} loading={busy} type="primary">
                    提交填报
                  </Button>
                </Form>
              </ProCard>
              <ProCard className="table-card" title={`我的协作填报（${filteredRecords.length}）`}>
                <div className="filter-bar">
                  <Input
                    placeholder="按客户、联系人、纪要筛选"
                    value={recordFilters.keyword}
                    onChange={(event) =>
                      setRecordFilters((current) => ({ ...current, keyword: event.target.value }))
                    }
                  />
                  <Select
                    value={recordFilters.status}
                    onChange={(status) => setRecordFilters((current) => ({ ...current, status }))}
                    options={[
                      { value: "all", label: "全部状态" },
                      { value: "draft", label: "草稿" },
                      { value: "submitted", label: "已提交" },
                      { value: "approved", label: "已通过" },
                      { value: "rejected", label: "已驳回" }
                    ]}
                  />
                  <Select
                    value={recordFilters.visitType}
                    onChange={(visitType) => setRecordFilters((current) => ({ ...current, visitType }))}
                    options={[
                      { value: "all", label: "全部类型" },
                      { value: "first-visit", label: "初次拜访" },
                      { value: "follow-up", label: "跟进沟通" },
                      { value: "contract", label: "合同洽谈" },
                      { value: "support", label: "售后支持" }
                    ]}
                  />
                  <Select
                    value={recordFilters.ruleLevel}
                    onChange={(ruleLevel) => setRecordFilters((current) => ({ ...current, ruleLevel }))}
                    options={[
                      { value: "all", label: "全部规则" },
                      { value: "high", label: "高优先级" },
                      { value: "medium", label: "需要跟进" },
                      { value: "normal", label: "常规跟进" }
                    ]}
                  />
                  <Button
                    icon={<FilterOutlined />}
                    onClick={() =>
                      setRecordFilters({ keyword: "", status: "all", visitType: "all", ruleLevel: "all" })
                    }
                  >
                    重置
                  </Button>
                </div>
                <Table
                  columns={recordColumns}
                  dataSource={filteredRecords}
                  expandable={{
                    expandedRowRender: (record) => (
                      <pre className="json-view">{JSON.stringify(record.payload, null, 2)}</pre>
                    )
                  }}
                  loading={busy}
                  pagination={{ pageSize: 8 }}
                  rowKey="id"
                  scroll={{ x: 980 }}
                  size="middle"
                />
              </ProCard>
            </div>
          </div>
        </PageContainer>
      </Layout>
    </ConfigProvider>
  );
}
