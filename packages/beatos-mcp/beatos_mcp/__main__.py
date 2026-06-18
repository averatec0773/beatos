"""Entry point for the `beatos-mcp` console script.

After v0.0.23 this is no longer an MCP server -- it's a launcher. The MCP server
runs as an ASGI app mounted at /mcp on the beatos-http sidecar. This launcher
runs an in-process stdio<->/mcp proxy (`beatos_mcp.proxy`): it always completes
the MCP handshake so clients attach even when BeatOS is offline, forwarding to
the sidecar's Streamable HTTP endpoint when it is up and serving a degraded
`beatos_status` tool when it is not.
"""
from beatos_mcp.launcher import main


if __name__ == "__main__":
    main()
