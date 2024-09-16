import * as snarkjs from 'snarkjs';

export async function mockProver(input: any) {
  // Load the circuit
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "test/e2e/prover/mock/main.wasm",
    "test/e2e/prover/mock/groth16_pkey.zkey"
  );
  
  let solidityCalldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  solidityCalldata = JSON.parse("["+solidityCalldata+"]");
  return { proof, publicSignals, solidityCalldata };
}
