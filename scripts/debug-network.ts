import { network } from "hardhat";

async function main() {
    console.log("Connecting...");
    const connection = await network.connect();
    console.log("Keys of connection:", Object.keys(connection));
    // Check if network name is available on the connection object
    // @ts-ignore
    console.log("Connection.network name:", connection.network?.name);
    // @ts-ignore
    console.log("Connection.name:", connection.name);
    // @ts-ignore
    console.log("Connection.provider.network:", connection.provider?.network);

    // Check if original network object was mutated
    // @ts-ignore
    console.log("Original network.name after connect:", network.name);
}

main().catch(console.error);
