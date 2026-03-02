import React from "react";
import { List, Button, Modal, Space, Typography, Empty } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { AISessionMeta } from "@lowcode-platform/types";

const { Text, Paragraph } = Typography;

interface SessionSidebarProps {
  sessions: AISessionMeta[];
  currentSessionId: string | null;
  onCreateNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  sessions,
  currentSessionId,
  onCreateNewSession,
  onSelectSession,
  onDeleteSession,
}) => {
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    Modal.confirm({
      title: "确认删除",
      content: "确定要删除这个会话吗？删除后将无法恢复。",
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: () => onDeleteSession(sessionId),
    });
  };

  return (
    <div className="session-sidebar">
      <div className="session-header">
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Text strong>对话历史</Text>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={onCreateNewSession}
          >
            新建
          </Button>
        </Space>
      </div>

      <div className="session-list">
        {sessions.length === 0 ? (
          <Empty
            description="暂无会话"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 20 }}
          />
        ) : (
          <List
            dataSource={sessions}
            renderItem={(session) => (
              <List.Item
                className={`session-item ${currentSessionId === session.id ? "session-item-active" : ""}`}
                onClick={() => onSelectSession(session.id)}
                style={{ cursor: "pointer" }}
              >
                <List.Item.Meta
                  title={
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        ellipsis={{ tooltip: session.title }}
                        strong={currentSessionId === session.id}
                      >
                        {session.title}
                      </Text>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        style={{ padding: "0 4px" }}
                      />
                    </div>
                  }
                  description={
                    <div>
                      <Text type="secondary" style={{ fontSize: "12px" }}>
                        {new Date(
                          session.lastMessageTimestamp,
                        ).toLocaleString()}
                      </Text>
                      <br />
                      <Paragraph
                        ellipsis={{
                          rows: 1,
                          tooltip: session.lastMessageContent,
                        }}
                        style={{ margin: 0, fontSize: "12px" }}
                      >
                        {session.lastMessageContent}
                      </Paragraph>
                    </div>
                  }
                />
                <div style={{ fontSize: "12px", color: "#888" }}>
                  {session.messageCount} 条消息
                </div>
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );
};
