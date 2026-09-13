import { describe, expect, it } from 'vitest';
import { onlyDigits, isValidCpfCnpj, isValidCep, isValidUf } from './validation';

describe('onlyDigits', () => {
  it('remove tudo que não é dígito', () => {
    expect(onlyDigits('123.456.789-09')).toBe('12345678909');
    expect(onlyDigits('12345-678')).toBe('12345678');
  });
});

describe('isValidCpfCnpj', () => {
  it('aceita um CPF válido', () => {
    expect(isValidCpfCnpj('11144477735')).toBe(true);
  });

  it('rejeita um CPF com dígito verificador errado', () => {
    expect(isValidCpfCnpj('11144477736')).toBe(false);
  });

  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(isValidCpfCnpj('11111111111')).toBe(false);
  });

  it('aceita um CNPJ válido', () => {
    expect(isValidCpfCnpj('11222333000181')).toBe(true);
  });

  it('rejeita um CNPJ com dígito verificador errado', () => {
    expect(isValidCpfCnpj('11222333000182')).toBe(false);
  });

  it('rejeita comprimento que não é 11 nem 14', () => {
    expect(isValidCpfCnpj('123')).toBe(false);
  });
});

describe('isValidCep', () => {
  it('aceita 8 dígitos', () => {
    expect(isValidCep('01310100')).toBe(true);
  });

  it('rejeita comprimento diferente de 8', () => {
    expect(isValidCep('123')).toBe(false);
    expect(isValidCep('013101000')).toBe(false);
  });
});

describe('isValidUf', () => {
  it('aceita UF válida', () => {
    expect(isValidUf('SP')).toBe(true);
    expect(isValidUf('sp')).toBe(false);
  });

  it('rejeita UF inexistente', () => {
    expect(isValidUf('XX')).toBe(false);
  });
});
