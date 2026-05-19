"""Entry point for the `beatos-mcp` console script.

After v0.0.23, this is no longer an MCP server -- it's a stdio->HTTP bridge launcher.
The MCP server runs as an ASGI app mounted at /mcp on the beatos-http sidecar.
This launcher reads the sidecar's handshake file and exec's mcp-proxy to bridge
Claude Desktop's stdio transport to the sidecar's HTTP endpoint.
"""
from beatos_mcp.launcher import main


if __name__ == "__main__":
    main()
