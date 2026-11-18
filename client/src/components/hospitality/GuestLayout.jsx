import Footer from '../layout/Footer';
import Header from '../layout/Header';

export default function GuestLayout({ children, hero = null }) {
  return <div className="min-h-screen bg-offwhite text-brown"><Header overlay={Boolean(hero)}/>{hero || <div className="h-22" aria-hidden="true"/>}<main className="mx-auto max-w-7xl px-6 py-12 lg:px-12 lg:py-20">{children}</main><Footer/></div>;
}
