import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const EXPECTED_TRANSLATIONS: Record<
  string,
  { displayName: string; description: string }
> = {
  banner: {
    displayName: "Banner",
    description: "Chamada institucional com texto, botão e link",
  },
  benefit: {
    displayName: "Benefício",
    description: "Benefício ou diferencial apresentado ao cliente",
  },
  hero: {
    displayName: "Destaque principal",
    description: "Conteúdo principal do topo da página inicial",
  },
  "link-column": {
    displayName: "Coluna de links",
    description: "Grupo de links exibido no rodapé",
  },
  link: {
    displayName: "Link",
    description: "Link de navegação com texto e destino",
  },
  stat: {
    displayName: "Número institucional",
    description: "Número ou indicador exibido na seção Sobre",
  },
  step: {
    displayName: "Etapa",
    description: "Etapa da seção Como funciona",
  },
  testimonial: {
    displayName: "Depoimento",
    description: "Depoimento de cliente com nome e localização",
  },
  "trust-badge": {
    displayName: "Selo de confiança",
    description: "Mensagem curta de confiança exibida no destaque principal",
  },
};

describe("schemas dos componentes institucionais", () => {
  it.each(Object.entries(EXPECTED_TRANSLATIONS))(
    "mantém nome e descrição de %s em pt-BR",
    (filename, expected) => {
      const schemaPath = path.resolve(
        process.cwd(),
        "src",
        "components",
        "institutional",
        `${filename}.json`,
      );
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

      expect(schema.info).toMatchObject(expected);
    },
  );
});
