/**
 * 模板画廊组件
 * 展示内置模板列表，支持预览和应用
 */
import React, { useState, useMemo } from 'react';
import {
  LayoutGrid,
  FormInput,
  Table2,
  LogIn,
  User,
  BarChart3,
  X,
  Check,
  FileText,
  AppWindow,
} from 'lucide-react';
import { getAllTemplates, getTemplate } from '../../templates';
import type { TemplateMeta, Template } from '../../templates/types';
import styles from './TemplateGallery.module.scss';

interface TemplateGalleryProps {
  open: boolean;
  onClose: () => void;
  onApply: (schema: Template['schema']) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  dashboard: <BarChart3 size={20} />,
  form: <FormInput size={20} />,
  list: <Table2 size={20} />,
  login: <LogIn size={20} />,
  profile: <User size={20} />,
  marketing: <LayoutGrid size={20} />,
  error: <X size={20} />,
  other: <FileText size={20} />,
  detail: <AppWindow size={20} />,
};

const categoryLabels: Record<string, string> = {
  dashboard: '仪表盘',
  form: '表单',
  list: '列表',
  login: '登录',
  profile: '个人中心',
  marketing: '营销页',
  error: '错误页',
  other: '其他',
  detail: '详情页',
};

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({ open, onClose, onApply }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const templates = useMemo(() => getAllTemplates(), []);

  const selectedTemplate = selectedId ? getTemplate(selectedId) : null;

  const handleApply = () => {
    if (selectedTemplate) {
      onApply(selectedTemplate.schema);
      onClose();
      setSelectedId(null);
    }
  };

  const handleClose = () => {
    onClose();
    setSelectedId(null);
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 左侧：模板列表 */}
        <div className={styles.listPanel}>
          <div className={styles.listHeader}>
            <h2>选择模板</h2>
            <span className={styles.count}>{templates.length} 个模板</span>
          </div>
          <div className={styles.templateList}>
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                selected={selectedId === template.id}
                onClick={() => setSelectedId(template.id)}
              />
            ))}
          </div>
        </div>

        {/* 右侧：预览面板 */}
        <div className={styles.previewPanel}>
          {selectedTemplate ? (
            <>
              <div className={styles.previewHeader}>
                <div className={styles.previewTitle}>
                  <span className={styles.categoryIcon}>
                    {categoryIcons[selectedTemplate.category]}
                  </span>
                  <h3>{selectedTemplate.nameZh}</h3>
                </div>
                <button className={styles.closeBtn} onClick={handleClose}>
                  <X size={18} />
                </button>
              </div>

              {/* 示例 Prompt */}
              {selectedTemplate.examplePrompt && (
                <div className={styles.promptSection}>
                  <div className={styles.promptLabel}>
                    <FileText size={14} />
                    <span>示例 Prompt</span>
                  </div>
                  <div className={styles.promptContent}>{selectedTemplate.examplePrompt}</div>
                </div>
              )}

              {/* 模板预览 */}
              <div className={styles.previewContent}>
                <div className={styles.previewPlaceholder}>
                  <div className={styles.previewIcon}>
                    {categoryIcons[selectedTemplate.category]}
                  </div>
                  <p>模板预览</p>
                  <span>点击应用后可在画布中查看完整效果</span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className={styles.actions}>
                <button className={styles.cancelBtn} onClick={handleClose}>
                  取消
                </button>
                <button className={styles.applyBtn} onClick={handleApply}>
                  <Check size={16} />
                  应用模板
                </button>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <LayoutGrid size={48} />
              <p>选择左侧模板查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** 模板卡片 */
const TemplateCard: React.FC<{
  template: TemplateMeta;
  selected: boolean;
  onClick: () => void;
}> = ({ template, selected, onClick }) => {
  return (
    <div className={`${styles.templateCard} ${selected ? styles.selected : ''}`} onClick={onClick}>
      <div className={styles.cardIcon}>{categoryIcons[template.category]}</div>
      <div className={styles.cardContent}>
        <div className={styles.cardTitle}>{template.nameZh}</div>
        <div className={styles.cardDesc}>{template.descriptionZh}</div>
        <div className={styles.cardTags}>
          <span className={styles.categoryTag}>{categoryLabels[template.category]}</span>
          {template.tags.slice(0, 2).map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      {selected && (
        <div className={styles.selectedBadge}>
          <Check size={14} />
        </div>
      )}
    </div>
  );
};

export default TemplateGallery;
