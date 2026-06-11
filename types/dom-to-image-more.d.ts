declare module "dom-to-image-more" {
  type DomToImageOptions = {
    width?: number;
    height?: number;
    bgcolor?: string;
    quality?: number;
    cacheBust?: boolean;
    copyDefaultStyles?: boolean;
    scale?: number;
    style?: Partial<CSSStyleDeclaration> & Record<string, string | number | undefined>;
    filter?: (node: Node) => boolean;
    onclone?: (clonedNode: HTMLElement) => void;
  };

  const domtoimage: {
    toJpeg(node: Node, options?: DomToImageOptions): Promise<string>;
    toPng(node: Node, options?: DomToImageOptions): Promise<string>;
    toBlob(node: Node, options?: DomToImageOptions): Promise<Blob>;
  };

  export default domtoimage;
}
