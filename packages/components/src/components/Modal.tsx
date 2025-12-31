import React from 'react';
import { Modal as AntModal } from 'antd';

/**
 * 对话框组件
 */
export interface ModalProps extends React.ComponentProps<typeof AntModal> {}

export const Modal: React.FC<ModalProps> = ({ width = 520, ...props }) => {
  return <AntModal width={width} {...props} />;
};

Modal.displayName = 'Modal';

export default Modal;
