import { Request, Response, NextFunction } from 'express';

// ============================================
// MIDDLEWARE GESTIONE ERRORI
// ============================================

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('❌ Errore:', err);

  const status = err.status || 500;
  const message = err.message || 'Errore interno del server';

  res.status(status).json({
    success: false,
    error: message
  });
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint non trovato'
  });
};
