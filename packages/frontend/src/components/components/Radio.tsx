import React from 'react';
import { Radio as AntRadio } from 'antd';

/**
 * 单选框组件
 */
export interface RadioProps extends React.ComponentProps<typeof AntRadio> {}

export const Radio: React.FC<RadioProps> = (props) => {
  return <AntRadio {...props} />;
};

Radio.displayName = 'Radio';

export const RadioGroup = AntRadio.Group;
export const RadioButton = AntRadio.Button;

export default Radio;
