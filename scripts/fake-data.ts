// Datos FICTICIOS (regla 5 y 11). Ningún nombre, documento ni teléfono
// corresponde a una persona real a propósito; los números de documento y
// teléfono se generan con prefijos de prueba.
//
// Tres juegos para la Fase 0 (tarea 2): normal, límite y hostil.

export type EventData = {
  evento_nombre: string;
  evento_lugar: string;
  evento_fecha: string;
  docente: string;
  evento_descripcion: string;
  transporte: string;
  aprobado_por: string;
};

export type StudentData = {
  nombre: string;
  documento_tipo: 'CC' | 'CE' | 'TI' | 'PAS';
  documento_numero: string;
  codigo: string;
  programa: string;
  eps: string;
  alergias: string;
  condicion_medica: string;
  contacto_nombre: string;
  contacto_parentesco: string;
  contacto_telefono: string;
};

export type Dataset = { id: 'normal' | 'limite' | 'hostil'; event: EventData; student: StudentData };

const FIRST = ['ANA', 'LUIS', 'CAMILA', 'ANDRÉS', 'VALENTINA', 'JULIÁN', 'SOFÍA', 'MATEO', 'ISABELA', 'SEBASTIÁN'];
const LAST = ['PRUEBA', 'EJEMPLO', 'FICTICIO', 'MUESTRA', 'DEMO', 'SIMULADO', 'ENSAYO', 'MODELO'];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
const digits = (rnd: () => number, n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');

// Estudiantes ficticios en lote (pruebas de carga de fases posteriores).
export function fakeStudents(count: number, seed = 42): StudentData[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    nombre: `${pick(rnd, FIRST)} ${pick(rnd, FIRST)} ${pick(rnd, LAST)} ${pick(rnd, LAST)}`,
    documento_tipo: 'CC' as const,
    documento_numero: `99${digits(rnd, 8)}`,
    codigo: `2000${digits(rnd, 5)}`,
    programa: 'Ingeniería Mecánica',
    eps: pick(rnd, ['EPS de Prueba Uno', 'EPS de Prueba Dos', 'Régimen especial de prueba']),
    alergias: rnd() < 0.7 ? 'Ninguna' : 'Penicilina (dato de prueba)',
    condicion_medica: rnd() < 0.8 ? 'Ninguna' : 'Asma leve (dato de prueba)',
    contacto_nombre: `${pick(rnd, FIRST)} ${pick(rnd, LAST)} ${pick(rnd, LAST)}`,
    contacto_parentesco: pick(rnd, ['Madre', 'Padre', 'Hermano(a)', 'Tío(a)', 'Pareja']),
    contacto_telefono: `300${digits(rnd, 7)}`,
  }));
}

const EVENT: EventData = {
  evento_nombre: 'Visita industrial de prueba',
  evento_lugar: 'Planta Ficticia S.A.S., Zona Industrial de Ejemplo',
  evento_fecha: '27/10/2026',
  docente: 'DOCENTE FICTICIO DE PRUEBA',
  evento_descripcion: 'Conocer los procesos de manufactura y mantenimiento de una planta de ejemplo.',
  transporte: 'Bus contratado (dato de prueba)',
  aprobado_por: 'COORDINACIÓN DE EJEMPLO',
};

// Rellena hasta `n` caracteres repitiendo el patrón (valores de longitud límite).
const upTo = (s: string, n: number) => (s.repeat(Math.ceil(n / s.length)) as string).slice(0, n).trimEnd();

export const DATASETS: Dataset[] = [
  {
    id: 'normal',
    event: EVENT,
    student: fakeStudents(1, 7)[0] as StudentData,
  },
  {
    id: 'limite',
    event: {
      ...EVENT,
      evento_nombre: upTo('Visita técnica a la planta de ensamblaje y pruebas de ejemplo, ', 120),
      evento_lugar: upTo('Parque Industrial Ficticio, bodega 14, kilómetro 7 vía de ejemplo, ', 120),
      evento_descripcion: upTo(
        'Observar líneas de producción, sistemas de refrigeración, compresores y protocolos de seguridad industrial; identificar oportunidades de mejora. ',
        500,
      ),
      transporte: upTo('Bus contratado por la institución de ejemplo con póliza vigente, ', 120),
    },
    student: {
      // 80 caracteres, tildes, ñ, apóstrofo y partículas ("de la", "de los").
      nombre: upTo("MARÍA DE LOS ÁNGELES D'ALESSANDRO ÑÚÑEZ DE LA HOZ GUTIÉRREZ-PEÑALOSA ÜBERMÜLLER ", 80),
      documento_tipo: 'PAS',
      documento_numero: 'ZX9876543210',
      codigo: '200099999999',
      programa: 'Otro: Especialización en Ingeniería de Mantenimiento Industrial de Ejemplo',
      eps: upTo('Otra: Medicina prepagada de ejemplo, plan complementario ', 60),
      alergias: upTo('Penicilina, sulfas, maní, mariscos, polen, látex, picadura de abeja (datos de prueba); ', 300),
      condicion_medica: upTo('Condición de prueba que requiere medicación diaria y descanso cada dos horas (dato ficticio); ', 300),
      contacto_nombre: upTo('JOSÉ ÁNGEL DE LA CRUZ O\'CONNOR PÉREZ DE LEÓN VILLARREAL ÑUSTES ', 80),
      contacto_parentesco: 'Acudiente o representante legal',
      contacto_telefono: '+5491123456789',
    },
  },
  {
    id: 'hostil',
    event: {
      ...EVENT,
      evento_nombre: 'Visita <b>negrita</b> & "comillas" \'simples\'',
      evento_descripcion: 'Texto con ]]> y <![CDATA[x]]> y &amp; ya escapado y <w:p> crudo',
    },
    student: {
      nombre: '<script>alert(1)</script> & {{nombre}}',
      documento_tipo: 'CE',
      documento_numero: '{@x}',
      codigo: '{#estudiantes}{/estudiantes}',
      programa: '{%firma} 👩🏽‍🔧 ingeniería',
      eps: '</w:t></w:r><w:r><w:t>INYECTADO',
      alergias: 'Ninguna\u0001\u0008\u000B\u001F (caracteres de control) ‮otseuqer‬',
      condicion_medica: '=HYPERLINK("http://ejemplo.invalid","clic") ; +cmd|\' /C calc\'!A0',
      contacto_nombre: "Robert'); DROP TABLE submissions;--",
      contacto_parentesco: '{-w:p}{/}',
      contacto_telefono: '+57 300 000 0000 ☎️',
    },
  },
];
