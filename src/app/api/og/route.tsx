import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        // Get product info from params
        const name = searchParams.get('name') || "Velari Premium Electronics";
        const price = searchParams.get('price');
        const image = searchParams.get('image');

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#fff',
                        fontFamily: 'sans-serif',
                        padding: '40px',
                    }}
                >
                    {/* Background decoration */}
                    <div style={{
                        position: 'absolute',
                        top: '-10%',
                        right: '-10%',
                        width: '40%',
                        height: '40%',
                        backgroundColor: '#2d6e3e',
                        borderRadius: '50%',
                        opacity: 0.1,
                    }} />

                    <div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        height: '100%',
                        gap: '40px'
                    }}>
                        {/* Left Side: Product Image */}
                        <div style={{
                            display: 'flex',
                            width: '45%',
                            height: '100%',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '40px',
                            overflow: 'hidden',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
                        }}>
                            {image && (
                                <img
                                    src={image}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                    }}
                                />
                            )}
                        </div>

                        {/* Right Side: Product Details */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            width: '50%',
                            justifyContent: 'center',
                        }}>
                            <div style={{
                                fontSize: '28px',
                                color: '#0F1410',
                                fontWeight: '900',
                                letterSpacing: '-1px',
                                marginBottom: '20px',
                                display: 'flex',
                                alignItems: 'baseline',
                            }}>
                                VELARI<span style={{ color: '#2d6e3e' }}>.</span>
                            </div>
                            <div style={{
                                fontSize: '48px',
                                fontWeight: '900',
                                color: '#000',
                                marginBottom: '20px',
                                display: 'flex',
                                flexWrap: 'wrap',
                                lineHeight: '1.2'
                            }}>
                                {name}
                            </div>
                            {price && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    backgroundColor: '#000',
                                    padding: '15px 30px',
                                    borderRadius: '20px',
                                    alignSelf: 'flex-start'
                                }}>
                                    <span style={{
                                        fontSize: '32px',
                                        color: '#fff',
                                        fontWeight: 'black',
                                        fontStyle: 'italic'
                                    }}>
                                        {Number(price).toLocaleString()} so'm
                                    </span>
                                </div>
                            )}
                            
                            <div style={{
                                display: 'flex',
                                marginTop: '40px',
                                color: '#6c757d',
                                fontSize: '18px',
                                fontWeight: 'bold'
                            }}>
                                velari.uz • Global Electronics
                            </div>
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            }
        );
    } catch (e: any) {
        console.log(`${e.message}`);
        return new Response(`Failed to generate the image`, {
            status: 500,
        });
    }
}
