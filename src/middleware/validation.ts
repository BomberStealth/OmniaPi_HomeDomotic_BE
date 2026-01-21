import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

// ============================================
// MIDDLEWARE VALIDAZIONE INPUT
// ============================================

/**
 * Schema validazione login
 */
export const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.email': 'Email non valida',
      'any.required': 'Email richiesta'
    }),
  password: Joi.string()
    .min(6)
    .max(100)
    .required()
    .messages({
      'string.min': 'Password troppo corta',
      'string.max': 'Password troppo lunga',
      'any.required': 'Password richiesta'
    })
});

/**
 * Schema validazione registrazione
 */
export const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.email': 'Email non valida',
      'any.required': 'Email richiesta'
    }),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'Password deve essere almeno 8 caratteri',
      'string.max': 'Password troppo lunga',
      'string.pattern.base': 'Password deve contenere almeno una maiuscola, una minuscola e un numero',
      'any.required': 'Password richiesta'
    }),
  nome: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.min': 'Nome troppo corto',
      'string.max': 'Nome troppo lungo',
      'any.required': 'Nome richiesto'
    }),
  cognome: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.min': 'Cognome troppo corto',
      'string.max': 'Cognome troppo lungo',
      'any.required': 'Cognome richiesto'
    }),
  ruolo: Joi.string()
    .valid('proprietario', 'installatore')
    .default('proprietario')
    .messages({
      'any.only': 'Ruolo non valido. Deve essere "proprietario" o "installatore"'
    }),
  gdprAccepted: Joi.boolean()
    .required()
    .messages({
      'any.required': 'Devi accettare l\'informativa sulla privacy'
    }),
  ageConfirmed: Joi.boolean()
    .required()
    .messages({
      'any.required': 'Devi confermare di avere almeno 16 anni'
    })
});

/**
 * Middleware generico per validazione
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Mostra tutti gli errori, non solo il primo
      stripUnknown: true // Rimuovi campi non definiti nello schema
    });

    if (error) {
      const errors = error.details.map(detail => detail.message);
      return res.status(400).json({
        success: false,
        error: 'Dati non validi',
        details: errors
      });
    }

    // Sostituisci body con valori validati e sanitizzati
    req.body = value;
    next();
  };
};

/**
 * Sanitizza stringa da SQL injection
 */
export const sanitizeString = (str: string): string => {
  return str
    .replace(/['";\\]/g, '') // Rimuovi caratteri pericolosi
    .trim();
};

/**
 * Valida e sanitizza email
 */
export const sanitizeEmail = (email: string): string => {
  return email
    .toLowerCase()
    .trim()
    .replace(/[^\w\s@.-]/gi, ''); // Solo caratteri validi per email
};
