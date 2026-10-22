-- Perfil del estudiante para el recomendador de ofertas
ALTER TABLE "users" ADD COLUMN     "career" TEXT,
ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preferredModality" TEXT;
