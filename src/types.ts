export type FinishedFormat = "A5";

export interface PageTransform {
  /** 0..1, normalized offset of image center within the frame, 0.5 = centered */
  offsetX: number;
  offsetY: number;
  /** multiplier on top of the "cover" fit scale */
  scale: number;
  /** 0, 90, 180, 270 */
  rotation: 0 | 90 | 180 | 270;
}

export interface ZinePage {
  /** 1-indexed page number, 1 = front cover */
  pageNumber: number;
  imageId: string | null;
  transform: PageTransform;
}

export interface ZineRecord {
  id: string;
  title: string;
  format: FinishedFormat;
  pageCount: number;
  pages: ZinePage[];
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_TRANSFORM: PageTransform = {
  offsetX: 0.5,
  offsetY: 0.5,
  scale: 1,
  rotation: 0,
};
