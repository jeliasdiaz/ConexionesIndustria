declare module 'docxtemplater-image-module-free' {
  type ImageModuleOptions = {
    centered?: boolean;
    fileType?: 'docx' | 'pptx';
    getImage: (tagValue: unknown, tagName: string) => Buffer | Uint8Array;
    getSize: (img: Buffer | Uint8Array, tagValue: unknown, tagName: string) => [number, number];
  };
  export default class ImageModule {
    constructor(options: ImageModuleOptions);
  }
}
