/// <reference types="vite/client" />

declare module '*.css' {
  const content: { className: string };
  export default content;
}

declare module '*.scss' {
  const content: { className: string };
  export default content;
}

declare module '*.svg' {
  const content: React.FC<React.SVGAttributes<SVGElement>>;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}
