import React from 'react';
import { Form as AntForm } from 'antd';

/**
 * 表单组件
 */
export type FormProps = React.ComponentProps<typeof AntForm>;

export const Form: React.FC<FormProps> = (props) => {
  return <AntForm {...props} />;
};

Form.displayName = 'Form';

export const FormItem = AntForm.Item;

export default Form;
