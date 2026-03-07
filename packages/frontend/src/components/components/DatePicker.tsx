import React from 'react';
import { DatePicker as AntDatePicker } from 'antd';

/**
 * 日期选择器组件
 */
export type DatePickerProps = React.ComponentProps<typeof AntDatePicker>;

export const DatePicker: React.FC<DatePickerProps> = (props) => {
  return <AntDatePicker {...props} />;
};

DatePicker.displayName = 'DatePicker';

// RangePicker 是静态属性，单独导出
export const RangePicker: any = AntDatePicker.RangePicker;

export default DatePicker;
