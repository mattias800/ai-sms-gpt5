export interface Z80State {
  a: number;
  f: number;
  b: number;
  c: number;
  d: number;
  e: number;
  h: number;
  l: number;
  a_: number;
  f_: number;
  b_: number;
  c_: number;
  d_: number;
  e_: number;
  h_: number;
  l_: number;
  ix: number;
  iy: number;
  sp: number;
  pc: number;
  i: number;
  r: number;
  im: 0 | 1 | 2;
  iff1: boolean;
  iff2: boolean;
  halted: boolean;
}

export const createResetState = (): Z80State => ({
  a: 0,
  f: 0,
  b: 0,
  c: 0,
  d: 0,
  e: 0,
  h: 0,
  l: 0,
  a_: 0,
  f_: 0,
  b_: 0,
  c_: 0,
  d_: 0,
  e_: 0,
  h_: 0,
  l_: 0,
  ix: 0,
  iy: 0,
  sp: 0xffff,
  pc: 0x0000,
  i: 0,
  r: 0,
  im: 1,
  iff1: false,
  iff2: true, // Allow interrupts to be enabled when EI is executed
  halted: false,
});
