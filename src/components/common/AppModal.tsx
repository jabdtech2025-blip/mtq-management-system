import React from 'react';
import { Modal, ModalProps } from '../ui/Modal';

export type AppModalProps = ModalProps;

/**
 * Komponen Modal Standar & Reusable yang meneruskan ke komponen dasar src/components/ui/Modal.
 */
export const AppModal: React.FC<AppModalProps> = (props) => {
  return <Modal {...props} />;
};
