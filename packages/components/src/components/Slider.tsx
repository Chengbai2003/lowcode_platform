import React from 'react';
import { Slider as AntSlider } from 'antd';

/**
 * 滑动输入条组件
 */
export type SliderProps = React.ComponentProps<typeof AntSlider>;

export const Slider: React.FC<SliderProps> = (props) => {
  return <AntSlider {...props} />;
};

Slider.displayName = 'Slider';

export default Slider;
